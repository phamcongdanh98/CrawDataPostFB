const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');

let globalContext = null;
let isClosing = false;

/**
 * Khởi tạo hoặc lấy Browser Context dùng chung với persistent profile
 * Không launch lại browser cho từng bài viết
 */
async function getBrowserContext(customOptions = {}) {
  if (globalContext) {
    try {
      // Kiểm tra context còn sống hay không
      const pages = globalContext.pages();
      return globalContext;
    } catch (e) {
      globalContext = null;
    }
  }

  // Đảm bảo thư mục profile tồn tại
  if (!fs.existsSync(config.FB_PROFILE_DIR)) {
    fs.mkdirSync(config.FB_PROFILE_DIR, { recursive: true });
  }

  const headless = customOptions.headless !== undefined ? customOptions.headless : config.FB_HEADLESS;

  console.log(`[Browser] Khởi tạo Chromium (headless: ${headless}, profile: ${config.FB_PROFILE_DIR})...`);

  globalContext = await chromium.launchPersistentContext(config.FB_PROFILE_DIR, {
    headless,
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
    timezoneId: config.TZ,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-size=1280,800'
    ]
  });

  await globalContext.addInitScript(() => {
    delete Object.getPrototypeOf(navigator).webdriver;
  });

  globalContext.on('close', () => {
    globalContext = null;
  });

  return globalContext;
}

/**
 * Kiểm tra xem trang có bị chuyển hướng về màn hình đăng nhập hoặc checkpoint không
 */
async function checkPageLogin(page) {
  try {
    const currentUrl = page.url();

    // Kiểm tra URL
    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/checkpoint') ||
      currentUrl.includes('two_step_verification') ||
      currentUrl.includes('recover/initiate')
    ) {
      return {
        isLoggedIn: false,
        reason: 'Phát hiện URL chuyển hướng về trang đăng nhập hoặc checkpoint'
      };
    }

    // Kiểm tra DOM có các input đăng nhập không
    const loginInputExists = await page.evaluate(() => {
      const emailInput = document.querySelector('input[name="email"], input[id="email"]');
      const passInput = document.querySelector('input[name="pass"], input[id="pass"]');
      const loginButton = document.querySelector('button[name="login"], button[id="loginbutton"]');

      if (emailInput && passInput) return true;
      if (loginButton && (emailInput || passInput)) return true;

      // Kiểm tra văn bản thông báo cần đăng nhập
      const bodyText = document.body ? document.body.innerText : '';
      if (
        bodyText.includes('Đăng nhập Facebook') ||
        bodyText.includes('Log into Facebook') ||
        bodyText.includes('Bạn phải đăng nhập để tiếp tục') ||
        bodyText.includes('You must log in to continue')
      ) {
        // Chỉ coi là login nếu có input form kèm theo
        if (emailInput || passInput) return true;
      }

      return false;
    });

    if (loginInputExists) {
      return {
        isLoggedIn: false,
        reason: 'Phát hiện form đăng nhập Facebook trên trang'
      };
    }

    return { isLoggedIn: true };
  } catch (e) {
    // Nếu trang bị đóng hoặc lỗi DOM
    return { isLoggedIn: true, error: e.message };
  }
}

/**
 * Đóng an toàn Browser Context
 */
async function closeBrowserContext() {
  if (isClosing || !globalContext) return;
  isClosing = true;
  try {
    console.log('[Browser] Đang đóng Chromium context...');
    await globalContext.close();
  } catch (e) {
    // Bỏ qua lỗi đóng
  } finally {
    globalContext = null;
    isClosing = false;
  }
}

module.exports = {
  getBrowserContext,
  checkPageLogin,
  closeBrowserContext
};
