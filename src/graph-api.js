const fs = require('fs');
const path = require('path');
const config = require('./config');
const { maskToken, vnDateToUtcTimestamp, sleep, getCanonicalPostUrl } = require('./utils');
const { resolvePageAccessToken } = require('./token-resolver');

/**
 * Gọi Meta Graph API để lấy toàn bộ bài viết của Fanpage trong khoảng thời gian
 * Hỗ trợ tự động phân trang qua paging.next
 */
async function fetchPagePosts(sinceDate, untilDate, options = {}) {
  // Tự động nạp lại .env nếu người dùng vừa cập nhật token mới
  if (typeof config.reloadEnv === 'function') {
    config.reloadEnv();
  }

  if (!config.isApiConfigured()) {
    throw new Error('Chưa cấu hình Facebook Graph API trong .env (thiếu FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN)');
  }

  const { onPageProgress } = options;
  const pageId = config.FB_PAGE_ID;
  let accessToken = config.FB_PAGE_ACCESS_TOKEN;
  const version = config.FB_GRAPH_VERSION || 'v26.0';

  // Tự động kiểm tra và chuyển đổi User Token -> Page Access Token nếu cần
  const resolved = await resolvePageAccessToken(accessToken, pageId, version);
  if (resolved.ok && resolved.token) {
    if (resolved.converted) {
      console.log(`[API] Đã tự động chuyển đổi User Token sang Page Access Token cho: ${resolved.pageName} (${pageId})`);
      accessToken = resolved.token;
      try {
        const envPath = path.resolve(config.ROOT_DIR, '.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          envContent = envContent.replace(/FB_PAGE_ACCESS_TOKEN=.*/g, `FB_PAGE_ACCESS_TOKEN=${accessToken}`);
          fs.writeFileSync(envPath, envContent, 'utf8');
          config.reloadEnv();
        }
      } catch (e) {}
    }
  } else if (!resolved.ok) {
    throw new Error(`Lỗi xác thực Token Facebook: ${resolved.error}`);
  }

  // Tính toán Unix timestamp cho khoảng thời gian theo giờ Việt Nam
  const sinceTimestamp = vnDateToUtcTimestamp(sinceDate, false);
  const untilTimestamp = vnDateToUtcTimestamp(untilDate, true);

  const initialUrl = new URL(`https://graph.facebook.com/${version}/${pageId}/posts`);
  initialUrl.searchParams.set(
    'fields',
    'id,message,created_time,permalink_url,shares,status_type,parent_id,story,attachments{media_type,type,unshimmed_url,title,target},reactions.summary(total_count).limit(0).as(reactions),comments.summary(total_count).limit(0).as(comments)'
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

          // Nếu lỗi do thiếu quyền pages_read_user_content (Code 10), tự động fallback sang fields cơ bản
          if (errCode === 10 || errMsg.includes('pages_read_user_content')) {
            console.warn(`[API] Token chưa có quyền 'pages_read_user_content'. Tự động chuyển sang fields cơ bản (lấy bài viết + shares + type)...`);
            const fallbackUrl = new URL(nextUrl);
            fallbackUrl.searchParams.set('fields', 'id,message,created_time,permalink_url,shares,status_type,parent_id,story,attachments{media_type,type,unshimmed_url,title,target}');
            nextUrl = fallbackUrl.toString();
            const fbRes = await fetch(nextUrl, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(30000)
            });
            data = await fbRes.json();
            if (fbRes.ok && !data.error) {
              success = true;
              break;
            }
          }

          // Kiểm tra lỗi Token hết hạn hoặc sai quyền (OAuthException 190)
          if (errCode === 190 || (errType === 'OAuthException' && (errMsg.toLowerCase().includes('expired') || errMsg.toLowerCase().includes('token')))) {
            const authErr = new Error(`Token Facebook (Page Access Token) đã hết hạn hoặc không hợp lệ [Code 190]: "${errMsg}". Vui lòng tạo Token mới từ Meta Graph API Explorer.`);
            authErr.isAuthError = true;
            throw authErr;
          }

          throw new Error(`Graph API [${errType} ${errCode}]: ${errMsg}`);
        }

        success = true;
      } catch (err) {
        // Nếu là lỗi xác thực token hết hạn thì quăng lỗi ra ngay, không thử lại 3 lần vô ích
        if (err.isAuthError) {
          throw err;
        }

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

      // Phân loại bài viết chính xác:
      // 1. Có parent_id (chia sẻ từ một bài viết cha khác)
      // 2. status_type là 'shared_story'
      // 3. story có chứa 'chia sẻ' hoặc 'shared'
      // 4. attachments có type là 'share' hoặc link bài viết nguồn khác
      const storyLower = (p.story || '').toLowerCase();
      const isShared = Boolean(
        p.parent_id ||
        p.status_type === 'shared_story' ||
        storyLower.includes('chia sẻ') ||
        storyLower.includes('shared') ||
        p.attachments?.data?.some(att => 
          att.type === 'share' ||
          (att.type === 'link' && att.unshimmed_url && att.unshimmed_url.includes('facebook.com') && !att.unshimmed_url.includes(pageId))
        )
      );
      const postType = isShared ? 'SHARED' : 'ORIGINAL';

      allPosts.push({
        id: p.id,
        page_id: pageId,
        message: p.message || '',
        created_time: p.created_time,
        permalink_url: getCanonicalPostUrl(p, pageId) || p.permalink_url || `https://www.facebook.com/${p.id}`,
        likes_count: likesCount,
        comments_count: commentsCount,
        shares_count: sharesCount,
        post_type: postType
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
