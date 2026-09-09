const config = require('./config');
const db = require('./db');
const { syncPosts, detectPublishers } = require('./sync-service');
const { getBrowserContext, closeBrowserContext, checkPageLogin } = require('./facebook-browser');
const { detectPublisher } = require('./publisher-detector');
const { isValidDateFormat, isDateRangeValid } = require('./utils');

// Parse tham số CLI đơn giản, không cần thêm dependency dư thừa
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const flags = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=');
      const key = parts[0];
      const value = parts.length > 1 ? parts.slice(1).join('=') : (args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true);
      flags[key] = value;
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

async function handleTestPost(postUrl) {
  if (!postUrl) {
    console.error('Lỗi: Thiếu đường dẫn URL bài viết.');
    console.log('Cách dùng: npm run test:post -- "https://www.facebook.com/..."');
    process.exit(1);
  }

  console.log('\n[Test] URL:');
  console.log(postUrl);
  console.log('\n[Test] Đang mở Facebook...');

  let context = null;
  let page = null;

  try {
    context = await getBrowserContext({ headless: false });
    page = await context.newPage();
    page.setDefaultTimeout(35000);
    page.setDefaultNavigationTimeout(35000);

    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });

    // Kiểm tra đăng nhập
    const loginCheck = await checkPageLogin(page);
    if (!loginCheck.isLoggedIn) {
      console.log('\n[Test] Kết quả:');
      console.log('Status: LOGIN_REQUIRED');
      console.log('Lý do:', loginCheck.reason || 'Phiên đăng nhập không hợp lệ');
      console.log('Hướng dẫn: Hãy chạy: npm run login');
      return;
    }

    const result = await detectPublisher(page, {
      postId: 'test_post'
    });

    console.log('\n[Test] Kết quả:');
    console.log(`Status: ${result.status}`);

    if (result.status === 'FOUND') {
      console.log(`Publisher: ${result.name}`);
      console.log(`Publisher ID: ${result.id || 'N/A'}`);
      console.log(`Profile URL: ${result.profileUrl || 'N/A'}`);
      console.log(`Method: ${result.method}`);
      console.log(`Raw text: "${result.rawText || ''}"`);
    } else {
      console.log(`Lý do: ${result.reason || 'Không tìm thấy thông tin'}`);
      if (result.debugPath) {
        console.log('Debug lưu tại:');
        console.log(result.debugPath);
      }
    }
  } catch (err) {
    console.error('\n[Test] Lỗi thực thi:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
    await closeBrowserContext();
  }
}

async function handleSync(flags) {
  const since = flags.since;
  const until = flags.until;

  if (!since || !until) {
    console.error('Lỗi: Cần truyền đủ --since và --until (định dạng YYYY-MM-DD)');
    console.log('Ví dụ: node src/cli.js sync --since 2026-07-01 --until 2026-09-30');
    process.exit(1);
  }

  if (!isValidDateFormat(since) || !isValidDateFormat(until)) {
    console.error('Lỗi: Ngày không đúng định dạng YYYY-MM-DD.');
    process.exit(1);
  }

  if (!isDateRangeValid(since, until)) {
    console.error('Lỗi: Ngày bắt đầu (since) phải nhỏ hơn hoặc bằng ngày kết thúc (until).');
    process.exit(1);
  }

  try {
    const res = await syncPosts(since, until);
    console.log('\n[Sync] Kết quả đồng bộ bài viết:');
    console.log(`- Tổng số bài: ${res.total}`);
    console.log(`- Thêm mới: ${res.insertedCount}`);
    console.log(`- Cập nhật: ${res.updatedCount}`);
  } catch (err) {
    console.error('\n[Sync] Lỗi:', err.message);
    process.exit(1);
  }
}

async function handlePublishers(flags) {
  const force = Boolean(flags.force);
  console.log(`\n[Publishers] Bắt đầu tìm người đăng (Force recheck: ${force})...`);

  try {
    const res = await detectPublishers({ force });
    console.log('\n[Publishers] Kết quả hoàn thành:');
    console.log(`- Tổng bài cần xử lý: ${res.total}`);
    console.log(`- Đã xử lý: ${res.processed}`);
    console.log(`- Tìm thấy (FOUND): ${res.found}`);
    console.log(`- Không tìm thấy (NOT_FOUND): ${res.notFound}`);
    console.log(`- Lỗi: ${res.errors}`);
  } catch (err) {
    console.error('\n[Publishers] Lỗi:', err.message);
    process.exit(1);
  }
}

function handleStats() {
  const stats = db.getStats();
  console.log('\n================ THỐNG KÊ BÀI VIẾT FANPAGE ================');
  console.log(`Tổng bài viết:       ${stats.totalPosts}`);
  console.log(`Đã xác định (FOUND): ${stats.found}`);
  console.log(`Chờ xử lý (PENDING): ${stats.pending}`);
  console.log(`Không tìm thấy:      ${stats.notFound}`);
  console.log(`Lỗi / Không truy cập: ${stats.errors}`);
  console.log(`Số người đăng:       ${stats.publisherCount}`);
  console.log('----------------------------------------------------------');
  console.log('BẢNG THỐNG KÊ NGƯỜI ĐĂNG:');
  console.log('Người đăng                              Số bài');
  console.log('----------------------------------------------------------');
  if (stats.publishers.length === 0) {
    console.log('(Chưa có dữ liệu người đăng)');
  } else {
    for (const p of stats.publishers) {
      const nameCol = p.publisher_name.padEnd(40, ' ');
      console.log(`${nameCol} ${p.count}`);
    }
  }
  console.log('==========================================================\n');
}

function printHelp() {
  console.log(`
Công cụ Thống kê bài viết Fanpage & Người đăng (Facebook Fanpage Publisher Stat)

Cách dùng CLI:
  node src/cli.js sync --since YYYY-MM-DD --until YYYY-MM-DD
    Lấy danh sách bài viết từ Meta Graph API v26 và lưu vào SQLite

  node src/cli.js publishers [--force]
    Chạy Playwright crawler để tìm người đăng bài (tùy chọn --force để quét lại)

  node src/cli.js test-post "URL"
    Mở trực tiếp 1 URL bài viết để kiểm tra detector trích xuất người đăng

  node src/cli.js stats
    Hiển thị bảng thống kê bài viết và người đăng trong SQLite

  node src/cli.js help
    Hiển thị trợ giúp này
  `);
}

async function main() {
  const { command, flags, positional } = parseArgs();

  switch (command) {
    case 'sync':
      await handleSync(flags);
      break;
    case 'publishers':
      await handlePublishers(flags);
      break;
    case 'test-post':
      await handleTestPost(flags.url || positional[0]);
      break;
    case 'stats':
      handleStats();
      break;
    case 'help':
    default:
      printHelp();
      break;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Lỗi ngoài ý muốn:', err);
    process.exit(1);
  });
}

module.exports = {
  main
};
