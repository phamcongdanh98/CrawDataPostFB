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

    // 2. Cập nhật publisher FOUND
    db.updatePublisherResult(testPostId, {
      status: 'FOUND',
      name: 'Tester Admin',
      id: '999999',
      profileUrl: 'https://facebook.com/tester.admin',
      rawText: 'Người đăng: Tester Admin',
      method: 'test-method'
    });

    const postAfterFound = db.getPostById(testPostId);
    assert.strictEqual(postAfterFound.publisher_name, 'Tester Admin');
    assert.strictEqual(postAfterFound.publisher_status, 'FOUND');

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
      sync_batch_id: batchId
    });
    assert.strictEqual(res2.updated, true);

    // Kiểm tra thông tin publisher vẫn giữ nguyên, không bị reset về PENDING
    const postPreserved = db.getPostById(testPostId);
    assert.strictEqual(postPreserved.publisher_name, 'Tester Admin');
    assert.strictEqual(postPreserved.publisher_status, 'FOUND');
    assert.strictEqual(postPreserved.likes_count, 50);
  });

  await test('getStats và getPublishersList phản ánh chính xác', () => {
    const stats = db.getStats();
    assert.strictEqual(typeof stats.totalPosts, 'number');
    assert.ok(stats.totalPosts >= 1);
    assert.ok(stats.found >= 1);

    const summary = db.getPublishersList();
    assert.ok(Array.isArray(summary));
    const tester = summary.find(s => s.publisher_name === 'Tester Admin');
    assert.ok(tester, 'Tester Admin phải có trong summary');
    assert.ok(tester.count >= 1);
  });

  await test('getPosts hỗ trợ phân trang và tìm kiếm theo nội dung', () => {
    const resSearch = db.getPosts({ search: 'thử nghiệm', page: 1, limit: 10 });
    assert.ok(resSearch.total >= 1);
    assert.ok(resSearch.items.length >= 1);
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

  // 6. EXPRESS SERVER VÀ API ENDPOINTS
  describe('6. Máy chủ Express & API Endpoints');
  const { app, server } = require('../src/server');

  // Đợi server lắng nghe
  await new Promise(resolve => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
  });

  const address = server.address();
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
    assert.ok(text.includes('STT,Ngày đăng,Người đăng'));
  });

  await test('GET /api/export.xlsx xuất file Excel định dạng bảng tính hợp lệ', async () => {
    const res = await fetch(`${baseUrl}/api/export.xlsx`);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('spreadsheetml.sheet'));
    const arrayBuffer = await res.arrayBuffer();
    assert.ok(arrayBuffer.byteLength > 1000, 'Kích thước file Excel hợp lệ');
  });

  // Dọn dẹp server
  await new Promise(resolve => server.close(resolve));

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
