const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { syncPosts, detectPublishers, syncAll, getJobState, stopJob } = require('./sync-service');
const { isValidDateFormat, isDateRangeValid, formatVNDate, escapeCsvField, truncate, normalizeDateStr } = require('./utils');
const { getBrowserContext, closeBrowserContext, checkPageLogin } = require('./facebook-browser');
const { detectPublisher } = require('./publisher-detector');

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
    port: config.PORT,
    timezone: config.TZ
  });
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
 * 5. Thống kê tổng quan và số bài theo từng người đăng
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
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
 * 7. Danh sách bài viết có phân trang và bộ lọc
 */
app.get('/api/posts', (req, res) => {
  try {
    const { since, until, publisher, status, search, page = 1, limit = 20 } = req.query;
    const result = db.getPosts({
      since,
      until,
      publisher,
      status,
      search,
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
    let { since, until, publisher, status, search } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const posts = db.getAllPostsForExport({ since, until, publisher, status, search });

    // UTF-8 BOM để Excel hiển thị đúng tiếng Việt
    let csv = '\uFEFF';
    csv += 'STT,Ngày đăng,Người đăng,Lượt thích (Likes),Bình luận (Comments),Chia sẻ (Shares),Nội dung bài viết,Trạng thái,Link Facebook,Publisher Profile URL,ID bài viết\n';

    let index = 1;
    for (const p of posts) {
      const formattedDate = formatVNDate(p.created_time);
      const row = [
        index++,
        escapeCsvField(formattedDate),
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
 * 8.1 Xuất dữ liệu Excel (.xlsx) chuyên nghiệp
 */
app.get('/api/export.xlsx', (req, res) => {
  try {
    const XLSX = require('xlsx');
    let { since, until, publisher, status, search } = req.query;
    if (since) since = normalizeDateStr(since) || since;
    if (until) until = normalizeDateStr(until) || until;

    const posts = db.getAllPostsForExport({ since, until, publisher, status, search });

    // Tạo mảng dữ liệu cho Excel
    const excelRows = posts.map((p, idx) => {
      let statusText = p.publisher_status;
      if (statusText === 'FOUND') statusText = 'Đã xác định';
      else if (statusText === 'PENDING') statusText = 'Chờ xử lý';
      else if (statusText === 'NOT_FOUND') statusText = 'Không tìm thấy';
      else if (statusText === 'LOGIN_REQUIRED') statusText = 'Cần đăng nhập';
      else if (statusText === 'POST_UNAVAILABLE') statusText = 'Không khả dụng';
      else if (statusText === 'ERROR') statusText = 'Lỗi';

      return {
        'STT': idx + 1,
        'Ngày đăng': formatVNDate(p.created_time),
        'Người đăng': p.publisher_name || 'Chưa xác định',
        'Lượt thích (Likes)': p.likes_count || 0,
        'Bình luận (Comments)': p.comments_count || 0,
        'Chia sẻ (Shares)': p.shares_count || 0,
        'Nội dung bài viết': p.message || '',
        'Trạng thái': statusText,
        'Link Facebook': p.permalink_url,
        'Trang cá nhân người đăng': p.publisher_profile_url || '',
        'ID bài viết': p.id
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Cài đặt độ rộng các cột cho đẹp
    worksheet['!cols'] = [
      { wch: 6 },  // STT
      { wch: 22 }, // Ngày đăng
      { wch: 25 }, // Người đăng
      { wch: 18 }, // Lượt thích
      { wch: 20 }, // Bình luận
      { wch: 18 }, // Chia sẻ
      { wch: 50 }, // Nội dung
      { wch: 16 }, // Trạng thái
      { wch: 45 }, // Link Facebook
      { wch: 40 }, // Profile URL
      { wch: 20 }  // ID
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Thống kê bài viết');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

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
 * 10. Chạy tiến trình tìm người đăng bài
 */
app.post('/api/detect-publishers', (req, res) => {
  const current = getJobState();
  if (current.isRunning) {
    return res.status(400).json({ error: 'Tiến trình tìm người đăng đang chạy. Vui lòng chờ.' });
  }

  const { force = false } = req.body;

  // Khởi chạy tiến trình bất đồng bộ ở background
  detectPublishers({ force: Boolean(force) }).catch((err) => {
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

    // Bước 2: Chạy crawler ở nền
    detectPublishers({ force: Boolean(force) }).catch((err) => {
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

const server = app.listen(config.PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Fanpage Publisher Stat Server đang chạy tại:`);
  console.log(`👉 http://localhost:${config.PORT}`);
  console.log(`======================================================\n`);
});

// Khởi tạo Database khi server start
db.getDb();

function shutdown() {
  console.log('\n[Server] Đang tắt máy chủ...');
  server.close(() => {
    db.closeDb();
    console.log('[Server] Đã đóng kết nối SQLite và dừng máy chủ.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, server };
