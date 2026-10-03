const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const db = require('./db');
const { syncPosts, detectPublishers, syncAll, getJobState, stopJob } = require('./sync-service');
const { isValidDateFormat, isDateRangeValid, formatVNDate, escapeCsvField, truncate, normalizeDateStr } = require('./utils');
const { getBrowserContext, closeBrowserContext, checkPageLogin } = require('./facebook-browser');
const { detectPublisher } = require('./publisher-detector');
const { resolvePageAccessToken } = require('./token-resolver');
const { testTelegramConnection } = require('./telegram-service');
const autoSyncScheduler = require('./auto-sync-scheduler');
const authService = require('./auth-service');
const { testSmtpConnection } = require('./email-service');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(__dirname, '..', 'public')));

// Middleware trích xuất token phiên đăng nhập (Bearer Token)
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    req.user = authService.getCurrentUser(token);
    req.token = token;
  }
  next();
});

/**
 * 1. Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * 2. Trạng thái cấu hình (Bảo mật: Không lộ token)
 */
app.get('/api/config-status', (req, res) => {
  res.json({
    isApiConfigured: config.isApiConfigured(),
    isProfilePresent: config.isProfilePresent(),
    pageId: config.FB_PAGE_ID || null,
    graphVersion: config.FB_GRAPH_VERSION,
    concurrency: config.FB_CONCURRENCY,
    delayMinMs: config.FB_DELAY_MIN_MS,
    delayMaxMs: config.FB_DELAY_MAX_MS,
    port: config.PORT,
    timezone: config.TZ
  });
});

/**
 * 2.1 Cập nhật cài đặt (Page ID, Access Token, Số luồng Concurrency, Delay)
 */
app.post('/api/settings', async (req, res) => {
  try {
    const { pageId, accessToken, concurrency, delayMinMs, delayMaxMs } = req.body;
    const updates = {};

    if (pageId) {
      updates.FB_PAGE_ID = pageId.trim();
    }

    if (accessToken) {
      let finalToken = accessToken.trim();
      // Thử tự động resolve page access token nếu người dùng dán user token
      const targetPageId = (pageId || config.FB_PAGE_ID || '').trim();
      if (targetPageId) {
        try {
          const resolved = await resolvePageAccessToken(finalToken, targetPageId, config.FB_GRAPH_VERSION);
          if (resolved.ok && resolved.token) {
            finalToken = resolved.token;
          }
        } catch (e) {}
      }
      updates.FB_PAGE_ACCESS_TOKEN = finalToken;
    }

    if (concurrency) {
      updates.FB_CONCURRENCY = Math.min(16, Math.max(1, parseInt(concurrency, 10) || 10));
    }

    if (delayMinMs !== undefined) {
      updates.FB_DELAY_MIN_MS = Math.max(10, parseInt(delayMinMs, 10) || 50);
    }

    if (delayMaxMs !== undefined) {
      updates.FB_DELAY_MAX_MS = Math.max(30, parseInt(delayMaxMs, 10) || 150);
    }

    config.updateEnvConfig(updates);

    res.json({
      success: true,
      message: 'Đã lưu cấu hình thành công vào .env',
      concurrency: config.FB_CONCURRENCY,
      pageId: config.FB_PAGE_ID
    });
  } catch (err) {
    res.status(500).json({ error: `Lỗi khi lưu cấu hình: ${err.message}` });
  }
});

/**
 * 2.2 Kiểm tra tính hợp lệ và quyền hạn của Access Token
 */
app.post('/api/test-token', async (req, res) => {
  try {
    let { accessToken, pageId } = req.body;
    accessToken = (accessToken || config.FB_PAGE_ACCESS_TOKEN || '').trim();
    pageId = (pageId || config.FB_PAGE_ID || '').trim();

    if (!accessToken) {
      return res.status(400).json({
        ok: false,
        error: 'Chưa có Access Token để kiểm tra. Vui lòng nhập hoặc cấu hình trong .env.'
      });
    }

    // 1. Gọi debug_token
    let debugData = null;
    try {
      const debugRes = await fetch(`https://graph.facebook.com/${config.FB_GRAPH_VERSION}/debug_token?input_token=${accessToken}&access_token=${accessToken}`);
      const json = await debugRes.json();
      if (json && json.data) {
        debugData = json.data;
      }
    } catch (e) {}

    // 2. Gọi me để lấy tên và ID
    let meData = null;
    let meError = null;
    try {
      const meRes = await fetch(`https://graph.facebook.com/${config.FB_GRAPH_VERSION}/me?fields=id,name&access_token=${accessToken}`);
      const json = await meRes.json();
      if (json && json.id) {
        meData = json;
      } else if (json && json.error) {
        meError = json.error.message;
      }
    } catch (e) {
      meError = e.message;
    }

    if (!debugData && !meData) {
      return res.json({
        ok: false,
        error: meError || 'Mã Access Token không hợp lệ hoặc đã hết hạn.'
      });
    }

    const scopes = (debugData && debugData.scopes) || [];
    const tokenType = (debugData && debugData.type) || (meData ? 'PAGE' : 'UNKNOWN');
    const isPageToken = tokenType === 'PAGE';
    const expiresAt = debugData && debugData.expires_at !== undefined
      ? (debugData.expires_at === 0 ? 'Vĩnh viễn (Never)' : new Date(debugData.expires_at * 1000).toLocaleString('vi-VN'))
      : 'Không xác định';

    const requiredScopes = [
      { name: 'pages_show_list', desc: 'Xem danh sách Fanpage' },
      { name: 'pages_read_engagement', desc: 'Đọc nội dung bài viết và lượt share' },
      { name: 'pages_read_user_content', desc: 'Đọc lượt Cảm xúc (Likes) và Bình luận (Comments)', critical: true },
      { name: 'pages_manage_posts', desc: 'Đọc chi tiết bài đăng của Trang' }
    ];

    const scopeStatus = requiredScopes.map(reqScope => ({
      name: reqScope.name,
      desc: reqScope.desc,
      critical: !!reqScope.critical,
      granted: scopes.includes(reqScope.name)
    }));

    const missingCritical = scopeStatus.filter(s => s.critical && !s.granted);
    const missingAny = scopeStatus.filter(s => !s.granted);

    let recommendation = '';
    if (!isPageToken) {
      recommendation = '⚠️ Đây là User Access Token, không phải Page Access Token! Vui lòng chọn Trang của bạn ở mục User or Page trên Graph Explorer.';
    } else if (missingCritical.length > 0) {
      recommendation = '❌ THIẾU QUYỀN QUAN TRỌNG: pages_read_user_content. Meta sẽ không cho phép đọc Lượt thích và Bình luận! Vui lòng vào Graph API Explorer thêm quyền này.';
    } else if (missingAny.length > 0) {
      recommendation = '⚠️ Token hợp lệ nhưng thiếu một số quyền phụ: ' + missingAny.map(s => s.name).join(', ');
    } else {
      recommendation = '✅ Token hoàn hảo 100%! Đầy đủ mọi quyền truy cập bài viết, Like, Bình luận, Share.';
    }

    return res.json({
      ok: true,
      tokenType,
      isPageToken,
      pageId: meData ? meData.id : (debugData ? debugData.profile_id : pageId),
      pageName: meData ? meData.name : 'Chưa xác định',
      appName: debugData ? debugData.application : 'Meta App',
      expiresAt,
      scopes,
      scopeStatus,
      hasPagesReadUserContent: scopes.includes('pages_read_user_content'),
      recommendation
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 2.3 Quản lý danh mục Đa Fanpage (Multi-Fanpage)
 */
app.get('/api/fanpages', (req, res) => {
  try {
    const list = db.getAllFanpages();
    res.json({ ok: true, fanpages: list, items: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/fanpages', async (req, res) => {
  try {
    const { id, name, accessToken, category, avatarUrl } = req.body;
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Thiếu ID Fanpage.' });
    }
    const page = db.upsertFanpage({ id, name, accessToken, category, avatarUrl });
    res.json({ ok: true, message: 'Đã lưu thông tin Fanpage thành công', page });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/fanpages/:id/select', async (req, res) => {
  try {
    const pageId = req.params.id;
    const page = db.setActiveFanpage(pageId);
    if (!page) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy Fanpage trong danh mục.' });
    }

    // Cập nhật cấu hình hiện tại để các lệnh crawl bài viết tự động chuyển sang Trang này
    const updates = { FB_PAGE_ID: page.id };
    if (page.access_token) {
      updates.FB_PAGE_ACCESS_TOKEN = page.access_token;
    }
    config.updateEnvConfig(updates);

    res.json({
      ok: true,
      message: `Đã kích hoạt làm việc với Fanpage: ${page.name} (${page.id})`,
      page
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/fanpages/:id', (req, res) => {
  try {
    const pageId = req.params.id;
    db.deleteFanpage(pageId);
    res.json({ ok: true, message: 'Đã xóa Fanpage khỏi danh mục quản lý.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 3. Trạng thái tiến trình worker hiện tại
 */
app.get('/api/status', (req, res) => {
  res.json(getJobState());
});

/**
 * 4. Dừng tiến trình worker
 */
app.post('/api/stop-job', (req, res) => {
  stopJob();
  res.json({ success: true, message: 'Đã gửi yêu cầu dừng tiến trình' });
});

/**
 * 4.1 Xóa sạch toàn bộ dữ liệu bài viết và các đợt đồng bộ
 */
app.post('/api/clear-data', (req, res) => {
  try {
    const result = db.clearAllPostsData();
    res.json({
      success: true,
      message: `Đã xóa sạch dữ liệu: ${result.deletedPosts} bài viết và ${result.deletedBatches} đợt đồng bộ.`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Thống kê tổng quan và số bài theo từng người đăng (Hỗ trợ lọc động)
 */
app.get('/api/stats', (req, res) => {
  try {
    let { pageId, since, until, batchId, publisher, status, postType, mediaType, search, minLikes, minComments, minShares } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const stats = db.getStats({ pageId, since, until, batchId, publisher, status, postType, mediaType, search, minLikes, minComments, minShares });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5.1 Dữ liệu biểu đồ trực quan (Chart.js)
 */
app.get('/api/chart-data', (req, res) => {
  try {
    let { pageId, since, until, batchId, publisher, status, postType, mediaType, search, minLikes, minComments, minShares } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const chartData = db.getChartData({ pageId, since, until, batchId, publisher, status, postType, mediaType, search, minLikes, minComments, minShares });
    res.json({
      ok: true,
      ...chartData
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 6. Danh sách tên các publisher
 */
app.get('/api/publishers', (req, res) => {
  try {
    const list = db.getPublishersList();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6.0 Bảng xếp hạng hiệu suất Người đăng (Leaderboard & KPI Analytics)
 */
app.get('/api/publisher-leaderboard', (req, res) => {
  try {
    let { pageId, since, until, batchId, postType, search } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const leaderboard = db.getPublisherLeaderboard({ pageId, since, until, batchId, postType, search });
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6.1 Danh sách các đợt đồng bộ bài viết
 */
app.get('/api/batches', (req, res) => {
  try {
    const batches = db.getSyncBatches();
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. Danh sách bài viết có phân trang và bộ lọc (hỗ trợ batchId, postType, mediaType, pageId, sortBy, sortOrder, minLikes, minComments, minShares)
 */
app.get('/api/posts', (req, res) => {
  try {
    const { pageId, since, until, batchId, publisher, status, postType, mediaType, search, sortBy, sortOrder, minLikes, minComments, minShares, page = 1, limit = 20 } = req.query;
    const result = db.getPosts({
      pageId,
      since,
      until,
      batchId,
      publisher,
      status,
      postType,
      mediaType,
      search,
      sortBy,
      sortOrder,
      minLikes,
      minComments,
      minShares,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7.1 Lấy thông tin chi tiết một bài viết theo ID
 */
app.get('/api/posts/:id', (req, res) => {
  try {
    const post = db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Không tìm thấy bài viết trong cơ sở dữ liệu.' });
    }
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7.2 Quét lại hàng loạt bài viết theo danh sách ID (Batch Rescan)
 */
app.post('/api/posts/batch-rescan', (req, res) => {
  const current = getJobState();
  if (current.isRunning) {
    return res.status(400).json({ error: 'Tiến trình tìm người đăng đang chạy. Vui lòng chờ.' });
  }

  const { postIds } = req.body;
  if (!Array.isArray(postIds) || postIds.length === 0) {
    return res.status(400).json({ error: 'Danh sách bài viết cần quét lại không hợp lệ hoặc để trống.' });
  }

  // Khởi chạy tìm người đăng ngầm cho tập postIds được chọn
  detectPublishers({
    postIds,
    force: true
  }).catch(err => {
    console.error('[API] Lỗi trong batch-rescan:', err);
  });

  res.json({
    success: true,
    count: postIds.length,
    message: `Đã bắt đầu quét lại ${postIds.length} bài viết đã chọn ở chế độ nền.`
  });
});

/**
 * 8. Xuất dữ liệu CSV
 */
app.get('/api/export.csv', (req, res) => {
  try {
    let { pageId, since, until, batchId, publisher, status, postType, mediaType, search, sortBy, sortOrder, minLikes, minComments, minShares } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const posts = db.getAllPostsForExport({ pageId, since, until, batchId, publisher, status, postType, mediaType, search, sortBy, sortOrder, minLikes, minComments, minShares });

    // UTF-8 BOM để Excel hiển thị đúng tiếng Việt
    let csv = '\uFEFF';
    csv += 'STT,Ngày đăng,Loại bài viết,Người đăng,Lượt thích (Likes),Bình luận (Comments),Chia sẻ (Shares),Định dạng,Ảnh xem trước,Nội dung bài viết,Trạng thái,Link Facebook,Publisher Profile URL,ID bài viết\n';

    let index = 1;
    for (const p of posts) {
      const formattedDate = formatVNDate(p.created_time);
      const postTypeText = p.post_type === 'SHARED' ? 'Chia sẻ' : 'Tự đăng';
      const row = [
        index++,
        escapeCsvField(formattedDate),
        escapeCsvField(postTypeText),
        escapeCsvField(p.publisher_name || ''),
        p.likes_count || 0,
        p.comments_count || 0,
        p.shares_count || 0,
        escapeCsvField(p.media_type || 'status'),
        escapeCsvField(p.thumbnail_url || ''),
        escapeCsvField(p.message || ''),
        escapeCsvField(p.publisher_status),
        escapeCsvField(p.permalink_url),
        escapeCsvField(p.publisher_profile_url || ''),
        escapeCsvField(p.id)
      ];
      csv += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="facebook-posts-stat.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).send(`Lỗi khi xuất CSV: ${err.message}`);
  }
});

/**
 * 8.1 Xuất dữ liệu Excel (.xlsx) chuẩn doanh nghiệp
 */
app.get('/api/export.xlsx', async (req, res) => {
  try {
    const { generateExcelReport } = require('./excel-exporter');
    let { pageId, since, until, batchId, publisher, status, postType, mediaType, search, sortBy, sortOrder, minLikes, minComments, minShares } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const filterObj = { pageId, since, until, batchId, publisher, status, postType, mediaType, search, sortBy, sortOrder, minLikes, minComments, minShares };
    const posts = db.getAllPostsForExport(filterObj);
    const stats = db.getStats(filterObj);

    // Xây dựng mô tả bộ lọc cho tiêu đề báo cáo Excel
    const filterDesc = [];
    if (batchId && batchId !== 'ALL') filterDesc.push(`Đợt: ${batchId}`);
    if (since && until) filterDesc.push(`Từ ${since} đến ${until}`);
    else if (since) filterDesc.push(`Từ ${since}`);
    else if (until) filterDesc.push(`Đến ${until}`);
    if (postType && postType !== 'ALL') filterDesc.push(`Loại: ${postType === 'SHARED' ? 'Chia sẻ' : 'Tự đăng'}`);
    if (mediaType && mediaType !== 'ALL') filterDesc.push(`Phương tiện: ${mediaType}`);
    if (status && status !== 'ALL') filterDesc.push(`Trạng thái: ${status}`);
    if (publisher) filterDesc.push(`Người đăng: ${publisher}`);
    if (search) filterDesc.push(`Từ khóa: "${search}"`);

    const buffer = await generateExcelReport(posts, {
      stats,
      filterInfo: { desc: filterDesc.length > 0 ? filterDesc.join(' | ') : 'Tất cả bài viết' }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="facebook-posts-stat.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).send(`Lỗi khi xuất Excel: ${err.message}`);
  }
});

/**
 * 9. Đồng bộ bài viết từ Graph API
 */
app.post('/api/sync-posts', async (req, res) => {
  const { since, until } = req.body;

  if (!config.isApiConfigured()) {
    return res.status(400).json({
      error: 'Chưa cấu hình Facebook Graph API trong .env. Vui lòng nhập FB_PAGE_ID và FB_PAGE_ACCESS_TOKEN.'
    });
  }

  if (!since || !until) {
    return res.status(400).json({ error: 'Vui lòng cung cấp cả ngày bắt đầu và kết thúc.' });
  }

  const normSince = normalizeDateStr(since);
  const normUntil = normalizeDateStr(until);

  if (!normSince || !normUntil) {
    return res.status(400).json({ error: 'Định dạng ngày không hợp lệ. Hãy dùng định dạng dd/mm/yyyy hoặc yyyy-mm-dd.' });
  }

  if (!isDateRangeValid(normSince, normUntil)) {
    return res.status(400).json({ error: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.' });
  }

  try {
    const result = await syncPosts(normSince, normUntil);
    res.json({
      success: true,
      message: `Đồng bộ thành công ${result.total} bài viết (Thêm mới: ${result.insertedCount}, Cập nhật: ${result.updatedCount})`,
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



/**
 * 9.2 Cập nhật nhanh Page Access Token vào .env mà không cần mở file
 */
app.post('/api/update-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'Token không được để trống.' });
    }

    const cleanToken = token.trim();
    const cleanPageId = config.FB_PAGE_ID;

    // Tự động phân giải token nếu người dùng dán User Token
    let finalToken = cleanToken;
    let pageName = null;
    let converted = false;

    if (cleanPageId) {
      const resolved = await resolvePageAccessToken(cleanToken, cleanPageId, config.FB_GRAPH_VERSION);
      if (resolved.ok && resolved.token) {
        finalToken = resolved.token;
        pageName = resolved.pageName;
        converted = resolved.converted;
      }
    }

    config.updateEnvConfig({ FB_PAGE_ACCESS_TOKEN: finalToken });

    res.json({
      success: true,
      message: converted 
        ? `Đã tự động chuyển đổi User Token sang Page Token cho "${pageName}" và lưu vào .env!`
        : 'Đã cập nhật Page Access Token thành công vào file .env!',
      pageName,
      converted
    });
  } catch (err) {
    res.status(500).json({ error: `Lỗi khi lưu token: ${err.message}` });
  }
});

/**
 * 10. Chạy tiến trình tìm người đăng bài
 */
app.post('/api/detect-publishers', (req, res) => {
  const current = getJobState();
  if (current.isRunning) {
    return res.status(400).json({ error: 'Tiến trình tìm người đăng đang chạy. Vui lòng chờ.' });
  }

  const { force = false, since, until, batchId } = req.body;

  // Khởi chạy tiến trình bất đồng bộ ở background với bộ lọc ngày/đợt
  detectPublishers({
    force: Boolean(force),
    since: since ? (normalizeDateStr(since) || since) : null,
    until: until ? (normalizeDateStr(until) || until) : null,
    batchId: batchId || null
  }).catch((err) => {
    console.error('[API] Lỗi trong tiến trình detect-publishers:', err);
  });

  res.json({
    success: true,
    message: 'Đã khởi động tiến trình tìm người đăng bài ở nền.'
  });
});

/**
 * 11. Đồng bộ tất cả (Graph API -> Detect Publisher)
 */
app.post('/api/sync-all', async (req, res) => {
  const current = getJobState();
  if (current.isRunning) {
    return res.status(400).json({ error: 'Có tiến trình đang chạy. Vui lòng chờ.' });
  }

  const { since, until, force = false } = req.body;

  if (!config.isApiConfigured()) {
    return res.status(400).json({
      error: 'Chưa cấu hình Facebook Graph API trong .env. Vui lòng nhập FB_PAGE_ID và FB_PAGE_ACCESS_TOKEN.'
    });
  }

  if (!since || !until) {
    return res.status(400).json({ error: 'Vui lòng cung cấp cả ngày bắt đầu và ngày kết thúc.' });
  }

  const normSince = normalizeDateStr(since);
  const normUntil = normalizeDateStr(until);

  if (!normSince || !normUntil) {
    return res.status(400).json({ error: 'Định dạng ngày không hợp lệ. Hãy dùng định dạng dd/mm/yyyy hoặc yyyy-mm-dd.' });
  }

  if (!isDateRangeValid(normSince, normUntil)) {
    return res.status(400).json({ error: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.' });
  }

  try {
    // Bước 1: Lấy bài viết từ Graph API (chờ đồng bộ xong)
    const syncResult = await syncPosts(normSince, normUntil);

    // Bước 2: Chạy crawler ở nền cho đúng đợt bài viết vừa lấy
    detectPublishers({
      force: Boolean(force),
      batchId: syncResult.batchId,
      since: normSince,
      until: normUntil
    }).catch((err) => {
      console.error('[API] Lỗi trong detectPublishers sau syncAll:', err);
    });

    res.json({
      success: true,
      message: `Đã đồng bộ ${syncResult.total} bài viết từ Graph API và bắt đầu tìm người đăng ở nền.`,
      syncResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 12. Test nhanh 1 bài viết trực tiếp từ giao diện
 */
app.post('/api/test-post', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Vui lòng nhập URL bài viết Facebook hợp lệ.' });
  }

  let context = null;
  let page = null;
  try {
    context = await getBrowserContext({ headless: false });
    page = await context.newPage();
    page.setDefaultTimeout(35000);

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const loginCheck = await checkPageLogin(page);
    if (!loginCheck.isLoggedIn) {
      return res.json({
        status: 'LOGIN_REQUIRED',
        reason: loginCheck.reason || 'Phiên Facebook đã hết hạn. Hãy chạy: npm run login'
      });
    }

    const result = await detectPublisher(page, { postId: 'quick_test' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'ERROR', reason: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
    await closeBrowserContext();
  }
});

/**
 * 13. Quét lại riêng một bài viết bất kỳ trong DB (Single Post Rescan)
 */
app.post('/api/posts/:id/rescan', async (req, res) => {
  const postId = req.params.id;
  let context = null;
  let page = null;
  try {
    const post = db.getPostById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Không tìm thấy bài viết trong cơ sở dữ liệu.' });
    }

    const { processSinglePost } = require('./publisher-worker');
    context = await getBrowserContext({ headless: config.FB_HEADLESS });
    page = await context.newPage();

    const result = await processSinglePost(page, post);
    db.updatePublisherResult(post.id, result);
    const updatedPost = db.getPostById(postId);

    res.json({
      success: true,
      post: updatedPost,
      result
    });
  } catch (err) {
    res.status(500).json({ error: `Lỗi khi quét lại bài viết: ${err.message}` });
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await closeBrowserContext();
  }
});

/**
 * 14. Tự động hóa & Telegram Bot API
 */
app.get('/api/automation/status', (req, res) => {
  try {
    res.json({
      ok: true,
      ...autoSyncScheduler.getStatus()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/automation/config', (req, res) => {
  try {
    const {
      enabled,
      intervalHours,
      lookbackDays,
      telegramToken,
      telegramChatId,
      telegramNotify
    } = req.body;

    const updates = {};
    if (enabled !== undefined) {
      updates.AUTO_SYNC_ENABLED = enabled ? 'true' : 'false';
    }
    if (intervalHours !== undefined) {
      const parsedHours = parseFloat(intervalHours);
      if (!isNaN(parsedHours) && parsedHours > 0) {
        updates.AUTO_SYNC_INTERVAL_HOURS = parsedHours;
      }
    }
    if (lookbackDays !== undefined) {
      const parsedDays = parseInt(lookbackDays, 10);
      if (!isNaN(parsedDays) && parsedDays > 0) {
        updates.AUTO_SYNC_LOOKBACK_DAYS = parsedDays;
      }
    }
    if (telegramToken !== undefined) {
      updates.TELEGRAM_BOT_TOKEN = telegramToken.trim();
    }
    if (telegramChatId !== undefined) {
      updates.TELEGRAM_CHAT_ID = telegramChatId.trim();
    }
    if (telegramNotify !== undefined) {
      updates.TELEGRAM_NOTIFY_ON_SYNC = telegramNotify ? 'true' : 'false';
    }

    config.updateEnvConfig(updates);
    autoSyncScheduler.restartScheduler();

    res.json({
      ok: true,
      message: 'Đã lưu cấu hình Tự động hóa & Telegram Bot thành công!',
      status: autoSyncScheduler.getStatus()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/automation/test-telegram', async (req, res) => {
  try {
    const token = (req.body.token || config.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = (req.body.chatId || config.TELEGRAM_CHAT_ID || '').trim();

    if (!token || !chatId) {
      return res.status(400).json({
        ok: false,
        error: 'Vui lòng nhập cả Telegram Bot Token và Chat ID để kiểm tra.'
      });
    }

    const testRes = await testTelegramConnection(token, chatId);
    res.json(testRes);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/automation/run-now', async (req, res) => {
  try {
    if (autoSyncScheduler.getStatus().isRunning) {
      return res.status(400).json({
        ok: false,
        error: 'Tiến trình tự động hóa đang chạy, vui lòng đợi.'
      });
    }
    // Kích hoạt chạy ngầm
    autoSyncScheduler.executeScheduledSync(true);
    res.json({
      ok: true,
      message: 'Đã kích hoạt chu trình đồng bộ tự động ngay lập tức!'
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 15. Hệ Thống Xác Thực Người Dùng & Email Verification (Auth API)
 */
// 15.1 Đăng ký tài khoản mới & gửi OTP
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    const result = await authService.register({ email, password, fullName });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 15.2 Xác thực OTP kích hoạt tài khoản
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    const result = await authService.verifyEmail({ email, code });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 15.3 Gửi lại mã OTP
app.post('/api/auth/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.resendVerificationCode({ email });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 15.4 Đăng nhập
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    if (!result.ok) {
      return res.status(401).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 15.5 Đăng xuất
app.post('/api/auth/logout', (req, res) => {
  try {
    const token = req.token || (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    const result = authService.logout(token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 15.6 Lấy thông tin tài khoản hiện tại
app.get('/api/auth/me', (req, res) => {
  if (req.user) {
    return res.json({ ok: true, user: req.user });
  }
  res.json({ ok: false, user: null, message: 'Chưa đăng nhập' });
});

// 15.7 Quên mật khẩu
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 15.8 Đặt lại mật khẩu
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const result = await authService.resetPassword({ email, code, newPassword });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 15.9 Trạng thái cấu hình SMTP Gmail
app.get('/api/auth/smtp-status', (req, res) => {
  res.json({
    ok: true,
    isConfigured: config.isSmtpConfigured(),
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    user: config.SMTP_USER ? config.SMTP_USER.replace(/(.{2})(.*)(@.*)/, '$1***$3') : null
  });
});

// 15.10 Kiểm tra hoặc cập nhật cài đặt SMTP
app.post('/api/auth/test-smtp', async (req, res) => {
  try {
    const { host, port, user, pass, saveConfig } = req.body;
    const testConfig = {
      host: host || config.SMTP_HOST,
      port: parseInt(port, 10) || config.SMTP_PORT,
      user: user || config.SMTP_USER,
      pass: pass || config.SMTP_PASS
    };

    const testRes = await testSmtpConnection(testConfig);

    if (testRes.ok && saveConfig && user && pass) {
      config.updateEnvConfig({
        SMTP_HOST: testConfig.host,
        SMTP_PORT: testConfig.port,
        SMTP_USER: testConfig.user,
        SMTP_PASS: testConfig.pass
      });
      testRes.message += ' (Đã lưu cấu hình vào file .env)';
    }

    res.json(testRes);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 16. Hệ Thống Quản Trị Hệ Thống (Admin API)
 */
// Middleware kiểm tra quyền Quản trị viên (Admin)
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'Yêu cầu đăng nhập để thực hiện chức năng này.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Quyền truy cập bị từ chối. Chỉ dành cho Quản trị viên (Admin).' });
  }
  next();
}

// 16.1 Lấy các chỉ số thống kê tổng quan hệ thống
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const result = authService.getAdminOverview();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 16.2 Lấy danh sách thành viên (có tìm kiếm & phân trang)
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const { search, role, page, limit } = req.query;
    const result = authService.adminListUsers({ search, role, page, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 16.3 Admin tạo trực tiếp người dùng mới
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { email, password, fullName, role, isVerified } = req.body;
    const result = await authService.adminCreateUser({ email, password, fullName, role, isVerified });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 16.4 Admin cập nhật vai trò người dùng (Admin <-> User)
app.patch('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  try {
    const { role } = req.body;
    const result = authService.adminUpdateUserRole(req.params.id, role, req.user.id);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 16.5 Admin kích hoạt hoặc tạm khóa tài khoản
app.patch('/api/admin/users/:id/status', requireAdmin, (req, res) => {
  try {
    const { isVerified } = req.body;
    const result = authService.adminToggleUserStatus(req.params.id, !!isVerified, req.user.id);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 16.6 Admin xóa vĩnh viễn tài khoản người dùng
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const result = authService.adminDeleteUser(req.params.id, req.user.id);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

let server = null;
if (require.main === module) {
  server = app.listen(config.PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Fanpage Publisher Stat Server đang chạy tại:`);
    console.log(`👉 http://localhost:${config.PORT}`);
    console.log(`======================================================\n`);

    // Tự động seed tài khoản admin nếu chưa có
    try {
      const seedRes = await authService.seedAdminAccount();
      if (seedRes.created) {
        console.log(`👑 [KHỞI TẠO TÀI KHOẢN ADMIN MẶC ĐỊNH]`);
        console.log(`👉 Email:    ${seedRes.email}`);
        console.log(`👉 Mật khẩu: ${seedRes.password}`);
        console.log(`👉 Vai trò:  Quản trị viên (admin - Đã kích hoạt 100%)\n`);
      } else {
        console.log(`👑 [TÀI KHOẢN ADMIN]: Đã sẵn sàng trong hệ thống (Email: ${seedRes.email}).\n`);
      }
    } catch (seedErr) {
      console.error('[Admin] Lỗi seed tài khoản:', seedErr.message);
    }

    // Khởi động scheduler hẹn giờ tự động
    autoSyncScheduler.startScheduler();
  });

  async function shutdown() {
    console.log('\n[Server] Đang tắt máy chủ...');
    autoSyncScheduler.stopScheduler();
    try {
      await closeBrowserContext();
      console.log('[Server] Đã giải phóng tài nguyên Chromium Playwright.');
    } catch (e) {}

    if (server) {
      server.close(() => {
        db.closeDb();
        console.log('[Server] Đã đóng kết nối SQLite và dừng máy chủ.');
        process.exit(0);
      });
    } else {
      db.closeDb();
      process.exit(0);
    }
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Khởi tạo Database và tự động tạo admin khi import
db.getDb();
authService.seedAdminAccount().catch(() => {});

module.exports = { app, server, requireAdmin };


