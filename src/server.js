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

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(__dirname, '..', 'public')));

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
    const envPath = path.resolve(config.ROOT_DIR, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    if (pageId) {
      if (/FB_PAGE_ID=.*/.test(envContent)) {
        envContent = envContent.replace(/FB_PAGE_ID=.*/g, `FB_PAGE_ID=${pageId.trim()}`);
      } else {
        envContent += `\nFB_PAGE_ID=${pageId.trim()}`;
      }
    }

    if (accessToken) {
      let finalToken = accessToken.trim();
      // Thử tự động resolve page access token nếu người dùng dán user token
      if (pageId) {
        try {
          const resolved = await resolvePageAccessToken(finalToken, pageId.trim(), config.FB_GRAPH_VERSION);
          if (resolved.ok && resolved.token) {
            finalToken = resolved.token;
          }
        } catch (e) {}
      }
      if (/FB_PAGE_ACCESS_TOKEN=.*/.test(envContent)) {
        envContent = envContent.replace(/FB_PAGE_ACCESS_TOKEN=.*/g, `FB_PAGE_ACCESS_TOKEN=${finalToken}`);
      } else {
        envContent += `\nFB_PAGE_ACCESS_TOKEN=${finalToken}`;
      }
    }

    if (concurrency) {
      const c = Math.min(16, Math.max(1, parseInt(concurrency, 10) || 10));
      if (/FB_CONCURRENCY=.*/.test(envContent)) {
        envContent = envContent.replace(/FB_CONCURRENCY=.*/g, `FB_CONCURRENCY=${c}`);
      } else {
        envContent += `\nFB_CONCURRENCY=${c}`;
      }
    }

    if (delayMinMs !== undefined) {
      const dMin = Math.max(10, parseInt(delayMinMs, 10) || 50);
      if (/FB_DELAY_MIN_MS=.*/.test(envContent)) {
        envContent = envContent.replace(/FB_DELAY_MIN_MS=.*/g, `FB_DELAY_MIN_MS=${dMin}`);
      } else {
        envContent += `\nFB_DELAY_MIN_MS=${dMin}`;
      }
    }

    if (delayMaxMs !== undefined) {
      const dMax = Math.max(30, parseInt(delayMaxMs, 10) || 150);
      if (/FB_DELAY_MAX_MS=.*/.test(envContent)) {
        envContent = envContent.replace(/FB_DELAY_MAX_MS=.*/g, `FB_DELAY_MAX_MS=${dMax}`);
      } else {
        envContent += `\nFB_DELAY_MAX_MS=${dMax}`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    config.reloadEnv();

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
    let { since, until, batchId, publisher, status, postType, search } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const stats = db.getStats({ since, until, batchId, publisher, status, postType, search });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
 * 7. Danh sách bài viết có phân trang và bộ lọc (hỗ trợ batchId, postType, sortBy, sortOrder)
 */
app.get('/api/posts', (req, res) => {
  try {
    const { since, until, batchId, publisher, status, postType, search, sortBy, sortOrder, page = 1, limit = 20 } = req.query;
    const result = db.getPosts({
      since,
      until,
      batchId,
      publisher,
      status,
      postType,
      search,
      sortBy,
      sortOrder,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8. Xuất dữ liệu CSV
 */
app.get('/api/export.csv', (req, res) => {
  try {
    let { since, until, batchId, publisher, status, postType, search, sortBy, sortOrder } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const posts = db.getAllPostsForExport({ since, until, batchId, publisher, status, postType, search, sortBy, sortOrder });

    // UTF-8 BOM để Excel hiển thị đúng tiếng Việt
    let csv = '\uFEFF';
    csv += 'STT,Ngày đăng,Loại bài viết,Người đăng,Lượt thích (Likes),Bình luận (Comments),Chia sẻ (Shares),Nội dung bài viết,Trạng thái,Link Facebook,Publisher Profile URL,ID bài viết\n';

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
        escapeCsvField(p.message || ''),
        escapeCsvField(p.publisher_status),
        escapeCsvField(p.permalink_url),
        escapeCsvField(p.publisher_profile_url || ''),
        escapeCsvField(p.id)
      ].join(',');
      csv += row + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="facebook-posts-stat.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).send(`Lỗi khi xuất CSV: ${err.message}`);
  }
});

/**
 * 8.1 Xuất dữ liệu Excel (.xlsx) chuyên nghiệp, thẩm mỹ cao
 */
app.get('/api/export.xlsx', async (req, res) => {
  try {
    const { generateExcelReport } = require('./excel-exporter');
    let { since, until, batchId, publisher, status, postType, search, sortBy, sortOrder } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const filterObj = { since, until, batchId, publisher, status, postType, search, sortBy, sortOrder };
    const posts = db.getAllPostsForExport(filterObj);
    const stats = db.getStats(filterObj);

    // Xây dựng mô tả bộ lọc cho tiêu đề báo cáo Excel
    const filterDesc = [];
    if (batchId && batchId !== 'ALL') filterDesc.push(`Đợt: ${batchId}`);
    if (since && until) filterDesc.push(`Từ ${since} đến ${until}`);
    else if (since) filterDesc.push(`Từ ${since}`);
    else if (until) filterDesc.push(`Đến ${until}`);
    if (postType && postType !== 'ALL') filterDesc.push(`Loại: ${postType === 'SHARED' ? 'Chia sẻ' : 'Tự đăng'}`);
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

    const envPath = path.resolve(config.ROOT_DIR, '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    if (envContent.includes('FB_PAGE_ACCESS_TOKEN=')) {
      envContent = envContent.replace(/FB_PAGE_ACCESS_TOKEN=.*/g, `FB_PAGE_ACCESS_TOKEN=${finalToken}`);
    } else {
      envContent += `\nFB_PAGE_ACCESS_TOKEN=${finalToken}\n`;
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    config.reloadEnv();

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

let server = null;
if (require.main === module) {
  server = app.listen(config.PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Fanpage Publisher Stat Server đang chạy tại:`);
    console.log(`👉 http://localhost:${config.PORT}`);
    console.log(`======================================================\n`);
  });

  function shutdown() {
    console.log('\n[Server] Đang tắt máy chủ...');
    if (server) {
      server.close(() => {
        db.closeDb();
        console.log('[Server] Đã đóng kết nối SQLite và dừng máy chủ.');
        process.exit(0);
      });
    }
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Khởi tạo Database khi server start
db.getDb();

module.exports = { app, server };
