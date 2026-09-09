const config = require('./config');
const db = require('./db');
const { getBrowserContext, closeBrowserContext, checkPageLogin } = require('./facebook-browser');
const { detectPublisher } = require('./publisher-detector');
const { sleep, getRandomDelay, truncate } = require('./utils');

// Trạng thái Job toàn cục trong bộ nhớ (In-memory state cho Dashboard polling)
const jobState = {
  isRunning: false,
  total: 0,
  processed: 0,
  found: 0,
  notFound: 0,
  errors: 0,
  currentPostMessage: '',
  currentPublisher: '',
  lastStatus: '',
  error: null,
  startTime: null,
  stopRequested: false
};

function getJobState() {
  return { ...jobState };
}

function resetJobState() {
  jobState.isRunning = false;
  jobState.total = 0;
  jobState.processed = 0;
  jobState.found = 0;
  jobState.notFound = 0;
  jobState.errors = 0;
  jobState.currentPostMessage = '';
  jobState.currentPublisher = '';
  jobState.lastStatus = '';
  jobState.error = null;
  jobState.startTime = null;
  jobState.stopRequested = false;
}

function stopJob() {
  if (jobState.isRunning) {
    jobState.stopRequested = true;
    console.log('[Worker] Đã gửi yêu cầu dừng tiến trình crawl.');
  }
}

function getCandidateUrls(post) {
  const urls = [];
  const parts = (post.id || '').split('_');
  const pageId = post.page_id || parts[0];
  const storyFbid = parts[1];

  if (pageId && storyFbid) {
    urls.push(`https://www.facebook.com/permalink.php?story_fbid=${storyFbid}&id=${pageId}`);
  }
  if (post.permalink_url && !urls.includes(post.permalink_url)) {
    urls.push(post.permalink_url);
  }
  return urls;
}

/**
 * Xử lý một bài viết đơn lẻ
 */
async function processSinglePost(context, post) {
  let page = null;
  let result = null;

  try {
    page = await context.newPage();

    // Giới hạn timeout 30s
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    const urls = getCandidateUrls(post);

    for (let i = 0; i < urls.length; i++) {
      const targetUrl = urls[i];
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

      // 1. Kiểm tra session đăng nhập
      const loginCheck = await checkPageLogin(page);
      if (!loginCheck.isLoggedIn) {
        return {
          status: 'LOGIN_REQUIRED',
          reason: loginCheck.reason || 'Phiên Facebook đã hết hạn. Hãy chạy: npm run login'
        };
      }

      // 2. Chạy detector
      result = await detectPublisher(page, {
        postId: post.id
      });

      if (result.status === 'FOUND') {
        break;
      }

      // Nếu còn URL dự phòng thì thử tiếp
      if (i < urls.length - 1) {
        await sleep(1000);
      }
    }

    return result || { status: 'NOT_FOUND', reason: 'Không tìm thấy thông tin người đăng' };
  } catch (err) {
    return {
      status: 'ERROR',
      reason: err.message
    };
    return result;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {}
    }
  }
}

/**
 * Chạy tiến trình trích xuất publisher cho danh sách bài viết
 * @param {Object} options
 * @param {boolean} options.force - quét lại cả bài đã xử lý
 * @param {number} options.limit - giới hạn số bài (nếu có)
 * @param {Function} options.onProgress - callback khi xong mỗi bài
 */
async function runPublisherWorker(options = {}) {
  if (jobState.isRunning) {
    throw new Error('Tiến trình lấy người đăng đang chạy, vui lòng chờ hoàn thành hoặc dừng lại.');
  }

  const force = Boolean(options.force);
  const limit = options.limit || 10000;
  const since = options.since || null;
  const until = options.until || null;
  const batchId = options.batchId || null;

  // Lấy các bài cần xử lý từ DB theo bộ lọc
  const postsToProcess = db.getPendingPosts({ limit, force, since, until, batchId });

  if (postsToProcess.length === 0) {
    console.log('[Worker] Không có bài viết nào cần xử lý.');
    return { total: 0, processed: 0, found: 0, notFound: 0, errors: 0 };
  }

  resetJobState();
  jobState.isRunning = true;
  jobState.total = postsToProcess.length;
  jobState.startTime = Date.now();

  console.log(`[Worker] Bắt đầu xử lý ${postsToProcess.length} bài viết (concurrency: ${config.FB_CONCURRENCY})...`);

  let context = null;

  try {
    context = await getBrowserContext({ headless: config.FB_HEADLESS });

    // Kiểm tra ban đầu xem đã có session Facebook chưa
    const testPage = await context.newPage();
    try {
      await testPage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      const initialLogin = await checkPageLogin(testPage);
      if (!initialLogin.isLoggedIn) {
        console.error('[Worker] CẢNH BÁO: Phiên Facebook chưa đăng nhập hoặc đã hết hạn.');
        console.error('[Worker] Hãy chạy: npm run login');
        jobState.error = 'Phiên Facebook đã hết hạn. Hãy chạy: npm run login';
        jobState.lastStatus = 'LOGIN_REQUIRED';
        return { ...jobState };
      }
    } finally {
      await testPage.close().catch(() => {});
    }

    // Thiết lập hàng đợi cho concurrency pool
    let currentIndex = 0;
    const activeWorkers = [];

    async function workerTask(workerId) {
      while (currentIndex < postsToProcess.length && !jobState.stopRequested) {
        const index = currentIndex++;
        const post = postsToProcess[index];
        const postPreview = truncate(post.message || `Post ID: ${post.id}`, 60);

        jobState.currentPostMessage = postPreview;

        let attempt = 0;
        let postResult = null;

        while (attempt < config.FB_MAX_RETRIES && !postResult) {
          attempt++;
          postResult = await processSinglePost(context, post);

          // Nếu lỗi tạm thời và chưa vượt max retries thì thử lại
          if (postResult.status === 'ERROR' && attempt < config.FB_MAX_RETRIES) {
            console.warn(`[Publisher] Bài ${post.id} gặp lỗi lần ${attempt}. Thử lại...`);
            await sleep(2000);
            postResult = null;
          }
        }

        // Cập nhật Database ngay lập tức
        db.updatePublisherResult(post.id, postResult);

        // Cập nhật thống kê in-memory
        jobState.processed++;
        jobState.lastStatus = postResult.status;

        if (postResult.status === 'FOUND') {
          jobState.found++;
          jobState.currentPublisher = postResult.name;
          console.log(`[Publisher] [Worker ${workerId}] ${jobState.processed}/${jobState.total} - FOUND: ${postResult.name} | ${postPreview}`);
        } else if (postResult.status === 'NOT_FOUND') {
          jobState.notFound++;
          console.log(`[Publisher] [Worker ${workerId}] ${jobState.processed}/${jobState.total} - NOT_FOUND | ${postPreview}`);
        } else if (postResult.status === 'LOGIN_REQUIRED') {
          jobState.errors++;
          jobState.error = 'Phiên Facebook đã hết hạn. Hãy chạy: npm run login';
          jobState.stopRequested = true;
          console.error('[Publisher] PHÁT HIỆN HẾT PHIÊN ĐĂNG NHẬP. Dừng toàn bộ tiến trình.');
          console.error('[Publisher] Hãy chạy: npm run login');
          break;
        } else {
          jobState.errors++;
          console.log(`[Publisher] [Worker ${workerId}] ${jobState.processed}/${jobState.total} - ${postResult.status}: ${postResult.reason || ''} | ${postPreview}`);
        }

        if (typeof options.onProgress === 'function') {
          options.onProgress({ ...jobState });
        }

        // Random delay giữa các bài để đảm bảo an toàn, ổn định
        if (!jobState.stopRequested && currentIndex < postsToProcess.length) {
          const delay = getRandomDelay(config.FB_DELAY_MIN_MS, config.FB_DELAY_MAX_MS);
          await sleep(delay);
        }
      }
    }

    // Khởi tạo các workers đồng thời
    const concurrency = Math.min(config.FB_CONCURRENCY, postsToProcess.length);
    for (let i = 1; i <= concurrency; i++) {
      activeWorkers.push(workerTask(i));
    }

    await Promise.all(activeWorkers);
  } catch (err) {
    jobState.error = err.message;
    console.error('[Worker] Lỗi nghiêm trọng trong quá trình xử lý:', err);
  } finally {
    jobState.isRunning = false;
    await closeBrowserContext();
    console.log(`[Worker] Kết thúc tiến trình. Xử lý: ${jobState.processed}/${jobState.total} (FOUND: ${jobState.found}, NOT_FOUND: ${jobState.notFound}, Lỗi: ${jobState.errors})`);
  }

  return { ...jobState };
}

module.exports = {
  runPublisherWorker,
  getJobState,
  stopJob,
  processSinglePost
};
