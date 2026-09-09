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

function parseCookieString(cookieStr) {
  if (!cookieStr || typeof cookieStr !== 'string') return [];
  const cleanStr = cookieStr.trim();

  // Hỗ trợ nếu người dùng truyền mảng JSON (J2TEAM Cookies / EditThisCookie)
  if (cleanStr.startsWith('[') && cleanStr.endsWith(']')) {
    try {
      const parsed = JSON.parse(cleanStr);
      return parsed.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '.facebook.com',
        path: c.path || '/',
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
        sameSite: c.sameSite === 'no_restriction' ? 'None' : (c.sameSite || 'Lax')
      }));
    } catch (e) {}
  }

  // Hỗ trợ chuỗi cookie thông thường: c_user=...; xs=...
  const parts = cleanStr.split(';');
  const cookies = [];
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const name = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (name) {
      cookies.push({
        name,
        value,
        domain: '.facebook.com',
        path: '/'
      });
    }
  }
  return cookies;
}

async function runLogin() {
  const args = process.argv.slice(2);
  let cookieArg = null;
  let useRealChrome = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--cookie=')) {
      cookieArg = a.replace('--cookie=', '').replace(/^['"]|['"]$/g, '');
    } else if (a === '--cookie' && args[i + 1]) {
      cookieArg = args[++i];
    } else if (a === '--channel=chrome' || a === '--chrome') {
      useRealChrome = true;
    }
  }

  console.log('\n======================================================');
  console.log('🔑 HƯỚNG DẪN ĐĂNG NHẬP FACEBOOK VÀO CHROMIUM');
  console.log('======================================================');
  console.log('⚠️  LƯU Ý CỰC KỲ QUAN TRỌNG:');
  console.log('👉 Hãy nhập trực tiếp EMAIL/SĐT và MẬT KHẨU FACEBOOK vào 2 ô đăng nhập.');
  console.log('❌ KHÔNG BẤM vào nút "Đăng nhập bằng Google" (Google chặn OAuth trên trình duyệt tự động).');
  console.log('👉 Nếu tài khoản chưa có mật khẩu Facebook: Hãy vào Cài đặt Facebook trên trình duyệt thường để tạo mật khẩu riêng.');
  console.log('👉 Hoặc bạn có thể dùng Cookie: node login.js --cookie "c_user=...; xs=..."');
  console.log('------------------------------------------------------');
  console.log(`[Login] Thư mục lưu phiên: ${FB_PROFILE_DIR}`);

  const launchOptions = {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
    timezoneId: process.env.TZ || 'Asia/Ho_Chi_Minh',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
      '--window-size=1280,800'
    ]
  };

  if (useRealChrome) {
    launchOptions.channel = 'chrome';
    console.log('[Login] Sử dụng Google Chrome chính thức của hệ thống');
  }

  const context = await chromium.launchPersistentContext(FB_PROFILE_DIR, launchOptions);

  // Ẩn cờ tự động hóa navigator.webdriver
  await context.addInitScript(() => {
    delete Object.getPrototypeOf(navigator).webdriver;
  });

  // Nếu người dùng truyền cookie qua CLI
  if (cookieArg) {
    const cookies = parseCookieString(cookieArg);
    if (cookies.length > 0) {
      console.log(`[Login] Đang nạp ${cookies.length} cookie vào trình duyệt...`);
      await context.addCookies(cookies);
      console.log('[Login] Nạp cookie thành công!');
    } else {
      console.warn('[Login] Không phân tích được chuỗi cookie.');
    }
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

  console.log('\n[Login] Trình duyệt Facebook đã mở.');
  console.log('[Login] Sau khi đăng nhập và chuyển sang Fanpage thành công, hãy ĐÓNG TRÌNH DUYỆT.');

  return new Promise((resolve) => {
    context.on('close', () => {
      console.log('\n[Login] Trình duyệt đã đóng. Phiên đăng nhập đã được lưu trữ thành công vào fb-profile.');
      resolve();
    });

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
