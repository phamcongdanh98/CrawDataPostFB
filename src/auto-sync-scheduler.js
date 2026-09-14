const config = require('./config');
const db = require('./db');
const { syncPosts, detectPublishers, getJobState } = require('./sync-service');
const { sendSyncReport } = require('./telegram-service');

let timerId = null;
let isSchedulerRunning = false;
let lastRunTime = null;
let nextRunTime = null;
let lastResult = null;
let lastError = null;

/**
 * Tính ngày dd/mm/yyyy từ timestamp
 */
function getFormattedDate(dateObj) {
  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Thực thi chu trình đồng bộ tự động và gửi thông báo qua Telegram
 */
async function executeScheduledSync(isManualTrigger = false) {
  if (isSchedulerRunning) {
    return { ok: false, error: 'Tiến trình đồng bộ tự động đang thực thi, vui lòng chờ.' };
  }

  const jobState = getJobState();
  if (jobState && jobState.isRunning) {
    const msg = 'Hệ thống đang bận với tiến trình đồng bộ khác. Bỏ qua lượt tự động này.';
    console.log(`[AutoSync] ${msg}`);
    return { ok: false, error: msg };
  }

  if (!config.isApiConfigured()) {
    const msg = 'Chưa cấu hình Facebook Page ID hoặc Access Token. Bỏ qua chu trình tự động.';
    console.warn(`[AutoSync] ${msg}`);
    return { ok: false, error: msg };
  }

  isSchedulerRunning = true;
  lastRunTime = new Date().toISOString();
  lastError = null;
  const startTime = Date.now();

  try {
    const lookbackDays = config.AUTO_SYNC_LOOKBACK_DAYS || 7;
    const now = new Date();
    const until = getFormattedDate(now);
    const sinceDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const since = getFormattedDate(sinceDate);

    console.log(`[AutoSync] Bắt đầu đồng bộ tự động (${since} -> ${until})...`);

    // 1. Đồng bộ bài viết mới từ Meta Graph API
    const syncRes = await syncPosts({
      since,
      until,
      batchName: `Tự động định kỳ (${since} - ${until})`
    });

    console.log(`[AutoSync] Đồng bộ bài viết hoàn tất: ${syncRes.totalFetched || 0} bài lấy được, ${syncRes.insertedCount || 0} bài mới.`);

    // 2. Chạy bóc tách người đăng và cập nhật tương tác cho bài viết pending
    const detectRes = await detectPublishers({ force: false });
    console.log(`[AutoSync] Bóc tách người đăng: Đã tìm ${detectRes.foundCount || 0}/${detectRes.total || 0} bài.`);

    const durationSec = Math.round((Date.now() - startTime) / 1000);

    // 3. Lấy dữ liệu tổng hợp để lập báo cáo
    const stats = db.getStats({ since, until });
    const topPublishers = db.getPublisherLeaderboard({ since, until }).slice(0, 5);
    const topPosts = db.getPosts({ since, until, sortBy: 'engagements', sortOrder: 'DESC', limit: 2 }).posts || [];

    const reportData = {
      pageName: `Fanpage (ID: ${config.FB_PAGE_ID})`,
      since,
      until,
      durationSec,
      totalPosts: stats.totalPosts || 0,
      insertedCount: syncRes.insertedCount || 0,
      foundPublishers: stats.foundCount || 0,
      totalLikes: stats.totalLikes || 0,
      totalComments: stats.totalComments || 0,
      totalShares: stats.totalShares || 0,
      topPublishers,
      topPosts
    };

    // Thử lấy tên thật của Fanpage nếu token còn sống
    try {
      const pageRes = await fetch(`https://graph.facebook.com/${config.FB_GRAPH_VERSION}/${config.FB_PAGE_ID}?fields=name&access_token=${config.FB_PAGE_ACCESS_TOKEN}`);
      const pageJson = await pageRes.json();
      if (pageJson && pageJson.name) {
        reportData.pageName = pageJson.name;
      }
    } catch (e) {}

    let telegramSent = false;
    let telegramError = null;

    // 4. Gửi báo cáo Telegram nếu bật thông báo và có token
    if (config.TELEGRAM_NOTIFY_ON_SYNC && config.isTelegramConfigured()) {
      console.log('[AutoSync] Đang gửi báo cáo qua Telegram Bot...');
      const teleRes = await sendSyncReport(reportData, {
        token: config.TELEGRAM_BOT_TOKEN,
        chatId: config.TELEGRAM_CHAT_ID
      });

      telegramSent = teleRes.ok;
      if (!teleRes.ok) {
        telegramError = teleRes.error;
        console.warn('[AutoSync] Lỗi gửi Telegram:', teleRes.error);
      } else {
        console.log('[AutoSync] Đã gửi báo cáo Telegram thành công!');
      }
    }

    lastResult = {
      ok: true,
      time: new Date().toISOString(),
      durationSec,
      reportData,
      telegramSent,
      telegramError
    };

    return lastResult;
  } catch (err) {
    console.error('[AutoSync] Lỗi trong chu trình tự động:', err);
    lastError = err.message;
    lastResult = {
      ok: false,
      error: err.message,
      time: new Date().toISOString()
    };
    return lastResult;
  } finally {
    isSchedulerRunning = false;
    calcNextRun();
  }
}

function calcNextRun() {
  if (!config.AUTO_SYNC_ENABLED) {
    nextRunTime = null;
    return;
  }
  const intervalMs = Math.max(0.1, config.AUTO_SYNC_INTERVAL_HOURS) * 3600 * 1000;
  nextRunTime = new Date(Date.now() + intervalMs).toISOString();
}

/**
 * Khởi động scheduler hẹn giờ
 */
function startScheduler() {
  stopScheduler();

  if (!config.AUTO_SYNC_ENABLED) {
    console.log('[AutoSync] Chế độ tự động đang TẮT (AUTO_SYNC_ENABLED=false).');
    return;
  }

  const intervalHours = config.AUTO_SYNC_INTERVAL_HOURS;
  const intervalMs = Math.max(0.01, intervalHours) * 3600 * 1000;

  calcNextRun();
  console.log(`[AutoSync] Đã bật chu trình tự động mỗi ${intervalHours} giờ. Lần chạy kế tiếp dự kiến: ${nextRunTime}`);

  timerId = setInterval(() => {
    executeScheduledSync(false);
  }, intervalMs);
}

/**
 * Dừng scheduler hẹn giờ
 */
function stopScheduler() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  nextRunTime = null;
}

/**
 * Khởi động lại scheduler khi thay đổi cấu hình
 */
function restartScheduler() {
  startScheduler();
}

/**
 * Lấy trạng thái hiện tại của Scheduler
 */
function getStatus() {
  return {
    enabled: config.AUTO_SYNC_ENABLED,
    intervalHours: config.AUTO_SYNC_INTERVAL_HOURS,
    lookbackDays: config.AUTO_SYNC_LOOKBACK_DAYS,
    telegramConfigured: config.isTelegramConfigured(),
    telegramNotify: config.TELEGRAM_NOTIFY_ON_SYNC,
    telegramChatId: config.TELEGRAM_CHAT_ID ? `...${config.TELEGRAM_CHAT_ID.slice(-4)}` : null,
    isRunning: isSchedulerRunning,
    lastRunTime,
    nextRunTime,
    lastResult,
    lastError
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  restartScheduler,
  executeScheduledSync,
  getStatus
};
