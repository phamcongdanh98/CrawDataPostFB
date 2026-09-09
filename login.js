const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const ROOT_DIR = __dirname;
const FB_PROFILE_DIR = path.resolve(ROOT_DIR, process.env.FB_PROFILE_DIR || './fb-profile');

if (!fs.existsSync(FB_PROFILE_DIR)) {
  fs.mkdirSync(FB_PROFILE_DIR, { recursive: true });
}

async function runLogin() {
  console.log('[Login] Đang mở Facebook...');
  console.log(`[Login] Thư mục lưu phiên: ${FB_PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(FB_PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
    timezoneId: process.env.TZ || 'Asia/Ho_Chi_Minh',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
      '--window-size=1280,800'
    ]
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

  console.log('[Login] Hãy đăng nhập bằng tài khoản quản trị.');
  console.log('[Login] Hỗ trợ nhập mã xác thực 2 bước (2FA) trực tiếp trên trình duyệt.');
  console.log('[Login] Sau khi xong hãy đóng Chromium.');

  // Lắng nghe khi trình duyệt đóng
  return new Promise((resolve) => {
    context.on('close', () => {
      console.log('\n[Login] Chromium đã đóng. Phiên đăng nhập đã được lưu trữ thành công vào fb-profile.');
      resolve();
    });

    // Bắt thêm Ctrl+C nếu người dùng dừng từ terminal
    process.on('SIGINT', async () => {
      console.log('\n[Login] Nhận tín hiệu dừng, đang đóng trình duyệt...');
      try {
        await context.close();
      } catch (e) {}
      resolve();
    });
  });
}

runLogin().catch((err) => {
  console.error('[Login] Lỗi khi chạy login:', err.message);
  process.exit(1);
});
