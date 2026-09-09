const config = require('./config');
const { maskToken, vnDateToUtcTimestamp, sleep } = require('./utils');

/**
 * Gọi Meta Graph API để lấy toàn bộ bài viết của Fanpage trong khoảng thời gian
 * Hỗ trợ tự động phân trang qua paging.next
 */
async function fetchPagePosts(sinceDate, untilDate, options = {}) {
  if (!config.isApiConfigured()) {
    throw new Error('Chưa cấu hình Facebook Graph API trong .env (thiếu FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN)');
  }

  const { onPageProgress } = options;
  const pageId = config.FB_PAGE_ID;
  const accessToken = config.FB_PAGE_ACCESS_TOKEN;
  const version = config.FB_GRAPH_VERSION || 'v26.0';

  // Tính toán Unix timestamp cho khoảng thời gian theo giờ Việt Nam
  const sinceTimestamp = vnDateToUtcTimestamp(sinceDate, false);
  const untilTimestamp = vnDateToUtcTimestamp(untilDate, true);

  const initialUrl = new URL(`https://graph.facebook.com/${version}/${pageId}/posts`);
  initialUrl.searchParams.set(
    'fields',
    'id,message,created_time,permalink_url,shares,reactions.summary(total_count).limit(0).as(reactions),comments.summary(total_count).limit(0).as(comments)'
  );
  initialUrl.searchParams.set('limit', '100');
  initialUrl.searchParams.set('since', String(sinceTimestamp));
  initialUrl.searchParams.set('until', String(untilTimestamp));
  initialUrl.searchParams.set('access_token', accessToken);

  let nextUrl = initialUrl.toString();
  const allPosts = [];
  let pageIndex = 1;

  console.log(`[API] Bắt đầu lấy bài viết từ Fanpage ID: ${pageId}`);
  console.log(`[API] Khoảng thời gian: ${sinceDate} -> ${untilDate}`);

  while (nextUrl) {
    let attempts = 0;
    let success = false;
    let data = null;

    while (attempts < 3 && !success) {
      attempts++;
      try {
        const response = await fetch(nextUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(30000)
        });

        data = await response.json();

        if (!response.ok || data.error) {
          const errMsg = data?.error?.message || `HTTP ${response.status} ${response.statusText}`;
          const errType = data?.error?.type || 'GraphAPIError';
          const errCode = data?.error?.code || response.status;
          throw new Error(`Graph API [${errType} ${errCode}]: ${errMsg}`);
        }

        success = true;
      } catch (err) {
        // Che giấu token trong thông báo lỗi nếu có
        const safeErrorMsg = maskToken(err.message);
        if (attempts >= 3) {
          throw new Error(`Lỗi kết nối Graph API sau 3 lần thử: ${safeErrorMsg}`);
        }
        console.warn(`[API] Lỗi tạm thời (lần thử ${attempts}/3): ${safeErrorMsg}. Thử lại sau 2 giây...`);
        await sleep(2000);
      }
    }

    const posts = data?.data || [];
    for (const p of posts) {
      const likesCount = p.reactions?.summary?.total_count ?? p.likes?.summary?.total_count ?? 0;
      const commentsCount = p.comments?.summary?.total_count ?? 0;
      const sharesCount = p.shares?.count ?? 0;

      allPosts.push({
        id: p.id,
        page_id: pageId,
        message: p.message || '',
        created_time: p.created_time,
        permalink_url: p.permalink_url || `https://www.facebook.com/${p.id}`,
        likes_count: likesCount,
        comments_count: commentsCount,
        shares_count: sharesCount
      });
    }

    console.log(`[API] Trang ${pageIndex}: ${posts.length} bài. Tổng tích lũy: ${allPosts.length} bài.`);
    if (typeof onPageProgress === 'function') {
      onPageProgress({
        pageIndex,
        currentPageCount: posts.length,
        totalFetched: allPosts.length
      });
    }

    // Kiểm tra trang kế tiếp từ paging.next
    if (data?.paging?.next) {
      nextUrl = data.paging.next;
      pageIndex++;
      // Nghỉ nhẹ 300ms giữa các request Graph API
      await sleep(300);
    } else {
      nextUrl = null;
    }
  }

  console.log(`[API] Hoàn thành lấy dữ liệu Graph API! Tổng cộng: ${allPosts.length} bài.`);
  return allPosts;
}

module.exports = {
  fetchPagePosts
};
