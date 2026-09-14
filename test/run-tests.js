const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  totalTests++;
  process.stdout.write(`  ⏳ ${name}... `);
  try {
    await fn();
    passedTests++;
    console.log('✅ PASS');
  } catch (err) {
    failedTests++;
    console.log('❌ FAIL');
    console.error('     Error:', err.message);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

function describe(title) {
  console.log(`\n📌 ${title}`);
}

async function runAllTests() {
  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ DỰ ÁN CRAW DATA FB');
  console.log('====================================================');

  // 1. CONFIG
  describe('1. Cấu hình hệ thống (src/config.js)');
  const config = require('../src/config');
  await test('Config load thành công và có các trường mặc định', () => {
    assert.ok(config.ROOT_DIR, 'ROOT_DIR phải tồn tại');
    assert.ok(config.DATA_DIR, 'DATA_DIR phải tồn tại');
    assert.ok(fs.existsSync(config.DATA_DIR), 'Thư mục data/ phải tồn tại');
    assert.ok(fs.existsSync(config.DEBUG_DIR), 'Thư mục debug/ phải tồn tại');
    assert.strictEqual(typeof config.PORT, 'number');
    assert.strictEqual(typeof config.FB_GRAPH_VERSION, 'string');
    assert.strictEqual(typeof config.isApiConfigured, 'function');
  });

  // 2. UTILS
  describe('2. Các hàm tiện ích (src/utils.js)');
  const utils = require('../src/utils');

  await test('normalizeDateStr hỗ trợ cả DD/MM/YYYY và YYYY-MM-DD', () => {
    assert.strictEqual(utils.normalizeDateStr('09/09/2026'), '2026-09-09');
    assert.strictEqual(utils.normalizeDateStr('1/7/2026'), '2026-07-01');
    assert.strictEqual(utils.normalizeDateStr('2026-09-09'), '2026-09-09');
    assert.strictEqual(utils.normalizeDateStr('invalid-date'), null);
  });

  await test('isValidDateFormat và isDateRangeValid', () => {
    assert.strictEqual(utils.isValidDateFormat('01/07/2026'), true);
    assert.strictEqual(utils.isValidDateFormat('2026-07-01'), true);
    assert.strictEqual(utils.isValidDateFormat('abc'), false);

    assert.strictEqual(utils.isDateRangeValid('01/07/2026', '09/09/2026'), true);
    assert.strictEqual(utils.isDateRangeValid('09/09/2026', '01/07/2026'), false);
  });

  await test('vnDateToUtcTimestamp chuyển đúng giờ VN UTC+7 sang timestamp', () => {
    const tsStart = utils.vnDateToUtcTimestamp('01/01/2026', false);
    const tsEnd = utils.vnDateToUtcTimestamp('01/01/2026', true);
    assert.strictEqual(typeof tsStart, 'number');
    assert.strictEqual(typeof tsEnd, 'number');
    assert.ok(tsEnd > tsStart, 'Cuối ngày phải lớn hơn đầu ngày');
    assert.strictEqual(tsEnd - tsStart, 86399, 'Khoảng cách giữa 00:00:00 và 23:59:59 là 86399 giây');
  });

  await test('formatVNDate định dạng đúng múi giờ Asia/Ho_Chi_Minh', () => {
    const formatted = utils.formatVNDate('2026-01-01T00:00:00Z');
    assert.ok(formatted.includes('01/01/2026'), 'Ngày phải hiển thị 01/01/2026');
    assert.ok(formatted.includes('07:00:00'), 'Giờ UTC+7 phải là 07:00:00');
  });

  await test('maskToken ẩn an toàn token Facebook trong text/url', () => {
    const raw = 'https://graph.facebook.com/v26.0/me?access_token=EAAG123456789SECRET&fields=id';
    const masked = utils.maskToken(raw);
    assert.ok(!masked.includes('EAAG123456789SECRET'), 'Token không được phép xuất hiện');
    assert.ok(masked.includes('[HIDDEN_TOKEN]'), 'Token phải được thay bằng [HIDDEN_TOKEN]');
  });

  await test('truncate và escapeCsvField', () => {
    assert.strictEqual(utils.truncate('1234567890', 5), '12345...');
    assert.strictEqual(utils.truncate('ngắn', 10), 'ngắn');
    assert.strictEqual(utils.escapeCsvField('hello "world"'), '"hello ""world"""');
    assert.strictEqual(utils.escapeCsvField(null), '""');
  });

  await test('getCanonicalPostUrl chuẩn hóa link Facebook dạng canonical', () => {
    const urlFromParts = utils.getCanonicalPostUrl('778169405386344_122189358200946007');
    assert.strictEqual(urlFromParts, 'https://www.facebook.com/permalink.php?story_fbid=122189358200946007&id=778169405386344');

    const urlFromObj = utils.getCanonicalPostUrl({
      id: '778169405386344_122189358200946007',
      page_id: '778169405386344'
    });
    assert.strictEqual(urlFromObj, 'https://www.facebook.com/permalink.php?story_fbid=122189358200946007&id=778169405386344');
  });

  // 3. PUBLISHER DETECTOR HELPERS
  describe('3. Xử lý trích xuất người đăng (src/publisher-detector.js)');
  const detector = require('../src/publisher-detector');

  await test('cleanPublisherName loại bỏ tiền tố và ký tự ẩn Unicode', () => {
    // Ký tự ẩn Unicode \u034F
    const raw = 'Người đăng: \u034FNguyễn Văn A · 2 giờ · 🌐';
    const cleaned = detector.cleanPublisherName(raw);
    assert.strictEqual(cleaned, 'Nguyễn Văn A');

    const rawEn = 'Published by: John Doe ?';
    assert.strictEqual(detector.cleanPublisherName(rawEn), 'John Doe');
  });

  await test('cleanPublisherName lọc các từ khóa blacklist', () => {
    assert.strictEqual(detector.cleanPublisherName('Người đăng: Facebook'), null);
    assert.strictEqual(detector.cleanPublisherName('Đăng bởi: Quản trị viên'), null);
    assert.strictEqual(detector.cleanPublisherName('a'), null); // Quá ngắn
  });

  await test('parseProfileInfo bóc tách đúng UID và làm sạch link', () => {
    const urlWithId = 'https://www.facebook.com/profile.php?id=1000888999&__cft__=AZX...';
    const resId = detector.parseProfileInfo(urlWithId, 'User Test');
    assert.strictEqual(resId.publisherId, '1000888999');
    assert.strictEqual(resId.profileUrl, 'https://www.facebook.com/profile.php?id=1000888999');

    const urlUsername = 'https://www.facebook.com/johndoe?ref=bookmarks';
    const resUser = detector.parseProfileInfo(urlUsername, 'John Doe');
    assert.strictEqual(resUser.profileUrl, 'https://www.facebook.com/johndoe');
  });

  // 4. DATABASE OPERATIONS
  describe('4. Cơ sở dữ liệu SQLite (src/db.js)');
  const db = require('../src/db');

  await test('Khởi tạo SQLite và bảng posts, sync_batches', () => {
    const sqlite = db.getDb();
    assert.ok(sqlite, 'Kết nối SQLite phải khả dụng');
    const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'").get();
    assert.ok(tableCheck, 'Bảng posts phải tồn tại');
  });

  await test('Thực hiện upsertPost và không ghi đè publisher khi đã FOUND', () => {
    const testPostId = 'test_post_' + Date.now();
    const batchId = 'test_batch_' + Date.now();

    // 1. Thêm mới bài viết
    const res1 = db.upsertPost({
      id: testPostId,
      page_id: 'page_123',
      message: 'Nội dung bài viết thử nghiệm',
      created_time: '2026-09-09T08:00:00Z',
      permalink_url: 'https://facebook.com/' + testPostId,
      likes_count: 10,
      comments_count: 5,
      shares_count: 2,
      sync_batch_id: batchId
    });
    assert.strictEqual(res1.inserted, true);

    // 2. Cập nhật publisher FOUND kèm tương tác và post_type
    db.updatePublisherResult(testPostId, {
      status: 'FOUND',
      name: 'Tester Admin',
      id: '999999',
      profileUrl: 'https://facebook.com/tester.admin',
      rawText: 'Người đăng: Tester Admin',
      method: 'test-method',
      likes: 116,
      comments: 19,
      shares: 25,
      postType: 'SHARED'
    });

    const postAfterFound = db.getPostById(testPostId);
    assert.strictEqual(postAfterFound.publisher_name, 'Tester Admin');
    assert.strictEqual(postAfterFound.publisher_status, 'FOUND');
    assert.strictEqual(postAfterFound.likes_count, 116, 'likes_count phải là 116 cập nhật từ crawler');
    assert.strictEqual(postAfterFound.comments_count, 19, 'comments_count phải là 19 cập nhật từ crawler');
    assert.strictEqual(postAfterFound.shares_count, 25, 'shares_count phải là 25 cập nhật từ crawler');
    assert.strictEqual(postAfterFound.post_type, 'SHARED', 'post_type phải là SHARED');

    // 3. Upsert lại với tương tác mới (Graph API sync lại)
    const res2 = db.upsertPost({
      id: testPostId,
      page_id: 'page_123',
      message: 'Nội dung bài viết thử nghiệm cập nhật',
      created_time: '2026-09-09T08:00:00Z',
      permalink_url: 'https://facebook.com/' + testPostId,
      likes_count: 50,
      comments_count: 20,
      shares_count: 10,
      post_type: 'SHARED',
      sync_batch_id: batchId
    });
    assert.strictEqual(res2.updated, true);

    // Kiểm tra thông tin publisher vẫn giữ nguyên, không bị reset về PENDING
    const postPreserved = db.getPostById(testPostId);
    assert.strictEqual(postPreserved.publisher_name, 'Tester Admin');
    assert.strictEqual(postPreserved.publisher_status, 'FOUND');
    assert.strictEqual(postPreserved.post_type, 'SHARED');

    // 4. Kiểm tra updatePublisherResult không bị hạ cấp bài SHARED thành ORIGINAL
    db.updatePublisherResult(testPostId, {
      status: 'FOUND',
      name: 'Tester Admin',
      postType: 'ORIGINAL'
    });
    const postNotDowngraded = db.getPostById(testPostId);
    assert.strictEqual(postNotDowngraded.post_type, 'SHARED', 'Bài viết SHARED tuyệt đối không bị hạ cấp thành ORIGINAL');
  });

  await test('clearAllPostsData là hàm hợp lệ và hỗ trợ dọn dẹp dữ liệu', () => {
    assert.strictEqual(typeof db.clearAllPostsData, 'function');
  });

  await test('getStats và getPublishersList phản ánh chính xác các trường mới', () => {
    const stats = db.getStats();
    assert.strictEqual(typeof stats.totalPosts, 'number');
    assert.ok(stats.totalPosts >= 1);
    assert.ok(stats.found >= 1);
    assert.strictEqual(typeof stats.originalPosts, 'number');
    assert.strictEqual(typeof stats.sharedPosts, 'number');
    assert.strictEqual(typeof stats.totalLikes, 'number');
    assert.strictEqual(typeof stats.totalComments, 'number');
    assert.strictEqual(typeof stats.totalShares, 'number');
    assert.strictEqual(typeof stats.totalEngagements, 'number');

    const summary = db.getPublishersList();
    assert.ok(Array.isArray(summary));
    const tester = summary.find(s => s.publisher_name === 'Tester Admin');
    assert.ok(tester, 'Tester Admin phải có trong summary');
    assert.ok(tester.count >= 1);
  });

  await test('getStats hỗ trợ lọc động theo search, postType, publisher', () => {
    const statsFiltered = db.getStats({ search: 'thử nghiệm' });
    assert.ok(statsFiltered.totalPosts >= 1, 'Lọc search phải có kết quả');
    
    const statsPub = db.getStats({ publisher: 'Tester Admin' });
    assert.ok(statsPub.totalPosts >= 1, 'Lọc theo publisher phải trả về bài viết');
    assert.ok(statsPub.found >= 1, 'Số bài found phải >= 1');

    const statsNone = db.getStats({ search: 'chuoi_khong_ton_tai_99999' });
    assert.strictEqual(statsNone.totalPosts, 0);
    assert.strictEqual(statsNone.totalEngagements, 0);
    assert.strictEqual(statsNone.publisherCount, 0);
  });

  await test('getPosts hỗ trợ lọc theo postType và sắp xếp theo tương tác', () => {
    const resSearch = db.getPosts({ search: 'thử nghiệm', page: 1, limit: 10 });
    assert.ok(resSearch.total >= 1);
    assert.ok(resSearch.items.length >= 1);

    const resShared = db.getPosts({ postType: 'SHARED', page: 1, limit: 10 });
    assert.ok(Array.isArray(resShared.items));
    if (resShared.items.length > 0) {
      assert.strictEqual(resShared.items[0].post_type, 'SHARED');
    }

    const resSorted = db.getPosts({ sortBy: 'likes_count', sortOrder: 'DESC', page: 1, limit: 10 });
    assert.ok(Array.isArray(resSorted.items));
  });

  // 5. PLAYWRIGHT CHROMIUM
  describe('5. Trình duyệt Playwright Chromium');
  const { chromium } = require('playwright');

  await test('Khởi chạy Chromium headless và thực thi JavaScript', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent('<html><head><title>Test Page</title></head><body><h1>Hello FB Stat</h1></body></html>');
    const title = await page.title();
    const h1Text = await page.$eval('h1', el => el.textContent);
    assert.strictEqual(title, 'Test Page');
    assert.strictEqual(h1Text, 'Hello FB Stat');
    await browser.close();
  });

  await test('detectPublisher bóc tách chính xác likes, comments, shares từ DOM', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const mockHtml = `
      <html><body>
        <div role="dialog">
          <div>Người đăng: Nguyễn Văn A</div>
          <div role="button" aria-label="Thích"><span dir="auto">42</span></div>
          <div role="button" aria-label="Viết bình luận"><span dir="auto">7</span></div>
          <div role="button" aria-label="Chia sẻ"><span dir="auto">3</span></div>
        </div>
      </body></html>
    `;
    await page.setContent(mockHtml);
    const result = await detector.detectPublisher(page, { postId: 'mock_test_123' });
    assert.strictEqual(result.status, 'FOUND');
    assert.strictEqual(result.name, 'Nguyễn Văn A');
    assert.strictEqual(result.likes, 42, 'Likes phải bóc tách được 42');
    assert.strictEqual(result.comments, 7, 'Comments phải bóc tách được 7');
    assert.strictEqual(result.shares, 3, 'Shares phải bóc tách được 3');
    await browser.close();
  });

  // 6. EXPRESS SERVER VÀ API ENDPOINTS
  describe('6. Máy chủ Express & API Endpoints');
  const { app } = require('../src/server');

  // Khởi chạy testServer trên cổng ngẫu nhiên rảnh để không xung đột port
  const testServer = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = testServer.address();
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;

  async function fetchJson(urlPath) {
    const res = await fetch(`${baseUrl}${urlPath}`);
    const data = await res.json();
    return { status: res.status, data };
  }

  await test('GET / phục vụ Dashboard HTML giao diện', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<!DOCTYPE html>'), 'Phải trả về tài liệu HTML');
    assert.ok(text.includes('THỐNG KÊ BÀI VIẾT FANPAGE') || text.includes('Fanpage'), 'Có tiêu đề ứng dụng');
  });

  await test('GET /api/health trả về trạng thái ok', async () => {
    const { status, data } = await fetchJson('/api/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'ok');
  });

  await test('GET /api/config-status không làm lộ Access Token', async () => {
    const { status, data } = await fetchJson('/api/config-status');
    assert.strictEqual(status, 200);
    assert.strictEqual(typeof data.isApiConfigured, 'boolean');
    assert.strictEqual(data.FB_PAGE_ACCESS_TOKEN, undefined, 'Access Token không được phép có trong response');
  });

  await test('GET /api/stats trả về số liệu thống kê', async () => {
    const { status, data } = await fetchJson('/api/stats');
    assert.strictEqual(status, 200);
    assert.strictEqual(typeof data.totalPosts, 'number');
    assert.strictEqual(typeof data.found, 'number');
  });

  await test('GET /api/posts trả về danh sách có phân trang', async () => {
    const { status, data } = await fetchJson('/api/posts?page=1&limit=5');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.items));
    assert.strictEqual(typeof data.total, 'number');
  });

  await test('GET /api/export.csv xuất định dạng CSV chuẩn UTF-8 BOM', async () => {
    const res = await fetch(`${baseUrl}/api/export.csv`);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('text/csv'));
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    assert.strictEqual(bytes[0], 0xEF, 'Byte 1 phải là 0xEF');
    assert.strictEqual(bytes[1], 0xBB, 'Byte 2 phải là 0xBB');
    assert.strictEqual(bytes[2], 0xBF, 'Byte 3 phải là 0xBF');
    const text = new TextDecoder().decode(bytes);
    assert.ok(text.includes('STT,Ngày đăng,Loại bài viết,Người đăng'));
  });

  await test('GET /api/export.xlsx xuất file Excel định dạng bảng tính hợp lệ', async () => {
    const res = await fetch(`${baseUrl}/api/export.xlsx`);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('spreadsheetml.sheet'));
    const arrayBuffer = await res.arrayBuffer();
    assert.ok(arrayBuffer.byteLength > 1000, 'Kích thước file Excel hợp lệ');
  });

  await test('db.getPublisherLeaderboard trả về bảng xếp hạng người đăng có đầy đủ chỉ số', () => {
    const leaderboard = db.getPublisherLeaderboard();
    assert.ok(Array.isArray(leaderboard), 'Leaderboard phải là mảng');
    const tester = leaderboard.find(l => l.publisher_name === 'Tester Admin');
    assert.ok(tester, 'Tester Admin phải xuất hiện trong Leaderboard');
    assert.ok(tester.total_posts >= 1, 'Số bài phải >= 1');
    assert.strictEqual(typeof tester.total_engagements, 'number');
    assert.strictEqual(typeof tester.avg_engagement, 'number');
  });

  await test('db.getPostsByIds trích xuất chính xác danh sách bài theo mảng ID', () => {
    const found = db.getPostsByIds(['test_post_non_existent', 'fake_id_123']);
    assert.ok(Array.isArray(found));
    assert.strictEqual(found.length, 0);
  });

  await test('db.getPosts hỗ trợ lọc theo minLikes', () => {
    const resMinLikes = db.getPosts({ minLikes: 5 });
    assert.ok(resMinLikes.total >= 1, 'Phải tìm thấy bài viết có minLikes >= 5');
    const resHighLikes = db.getPosts({ minLikes: 999999 });
    assert.strictEqual(resHighLikes.total, 0, 'Không thể có bài nào vượt quá 999999 likes');
  });

  await test('GET /api/publisher-leaderboard trả về mảng xếp hạng', async () => {
    const { status, data } = await fetchJson('/api/publisher-leaderboard');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data), 'Phản hồi từ /api/publisher-leaderboard phải là một mảng');
  });

  await test('GET /api/posts/:id trả về 404 cho id không tồn tại', async () => {
    const res = await fetch(`${baseUrl}/api/posts/khong_ton_tai_12345`);
    assert.strictEqual(res.status, 404);
  });

  await test('POST /api/posts/batch-rescan kiểm tra validate đầu vào', async () => {
    const res = await fetch(`${baseUrl}/api/posts/batch-rescan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postIds: [] })
    });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error);
  });

  // 7. CHART DATA & VISUAL DASHBOARD
  describe('7. Thống kê biểu đồ trực quan (Chart Data Analytics)');
  await test('db.getChartData trả về cấu trúc trends, postTypes, topPublishers', () => {
    const chartData = db.getChartData();
    assert.ok(chartData, 'chartData phải tồn tại');
    assert.ok(Array.isArray(chartData.trends), 'trends phải là mảng');
    assert.ok(Array.isArray(chartData.postTypes), 'postTypes phải là mảng');
    assert.ok(Array.isArray(chartData.topPublishers), 'topPublishers phải là mảng');
  });

  await test('GET /api/chart-data trả về dữ liệu biểu đồ hợp lệ', async () => {
    const { status, data } = await fetchJson('/api/chart-data');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.ok(Array.isArray(data.trends));
    assert.ok(Array.isArray(data.postTypes));
    assert.ok(Array.isArray(data.topPublishers));
  });

  // 8. TELEGRAM SERVICE & AUTO-SYNC SCHEDULER
  describe('8. Tự động hóa & Telegram Bot API');
  const telegramService = require('../src/telegram-service');
  const autoSyncScheduler = require('../src/auto-sync-scheduler');

  await test('telegram-service kiểm tra validate token và chatId', async () => {
    const resNoToken = await telegramService.sendTelegramMessage({ token: '', chatId: '123', text: 'Hi' });
    assert.strictEqual(resNoToken.ok, false);
    assert.ok(resNoToken.error.includes('Token'));

    const resNoChat = await telegramService.sendTelegramMessage({ token: 'abc', chatId: '', text: 'Hi' });
    assert.strictEqual(resNoChat.ok, false);
    assert.ok(resNoChat.error.includes('Chat ID'));

    const resNoText = await telegramService.sendTelegramMessage({ token: 'abc', chatId: '123', text: '' });
    assert.strictEqual(resNoText.ok, false);
    assert.ok(resNoText.error.includes('tin nhắn'));
  });

  await test('telegram-service.testTelegramConnection validate tham số', async () => {
    const res = await telegramService.testTelegramConnection('', '');
    assert.strictEqual(res.ok, false);
  });

  await test('auto-sync-scheduler.getStatus trả về cấu hình hiện tại', () => {
    const status = autoSyncScheduler.getStatus();
    assert.ok(status);
    assert.strictEqual(typeof status.enabled, 'boolean');
    assert.strictEqual(typeof status.intervalHours, 'number');
    assert.strictEqual(typeof status.lookbackDays, 'number');
    assert.strictEqual(typeof status.isRunning, 'boolean');
  });

  await test('GET /api/automation/status trả về trạng thái scheduler', async () => {
    const { status, data } = await fetchJson('/api/automation/status');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(typeof data.enabled, 'boolean');
  });

  await test('POST /api/automation/config cập nhật cấu hình hợp lệ', async () => {
    const res = await fetch(`${baseUrl}/api/automation/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: false,
        intervalHours: 6,
        lookbackDays: 7,
        telegramNotify: true
      })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.strictEqual(json.status.enabled, false);
  });

  await test('POST /api/automation/test-telegram kiểm tra validate thiếu thông tin', async () => {
    const res = await fetch(`${baseUrl}/api/automation/test-telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '', chatId: '' })
    });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.ok, false);
  });

  // Dọn dẹp dữ liệu test trong SQLite và đóng testServer
  try {
    db.getDb().prepare("DELETE FROM posts WHERE id LIKE 'test_%' OR page_id = 'page_123'").run();
  } catch (e) {}
  await new Promise(resolve => testServer.close(resolve));

  console.log('\n====================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASS`);
  if (failedTests > 0) {
    console.log(`❌ Có ${failedTests} bài test thất bại!`);
    process.exit(1);
  } else {
    console.log('🎉 TẤT CẢ CÁC BÀI TEST ĐÃ THÀNH CÔNG RỰC RỠ!');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
