const fs = require('fs');
const path = require('path');
const config = require('./config');
const { sleep } = require('./utils');
const { PUBLISHER_STATUS } = require('./constants');

/**
 * Trích xuất Publisher ID và chuẩn hóa Profile URL
 */
function parseProfileInfo(rawUrl, rawName) {
  let profileUrl = null;
  let publisherId = null;

  if (rawUrl && typeof rawUrl === 'string') {
    let url = rawUrl.trim();
    if (url.startsWith('/')) {
      url = `https://www.facebook.com${url}`;
    }

    // Xóa các tham số tracking như ?__cft__=, &__tn__=, etc.
    try {
      // Decode HTML entities nếu có (&amp; -> &)
      url = url.replace(/&amp;/g, '&');
      const parsed = new URL(url);
      const idParam = parsed.searchParams.get('id');
      if (idParam && /^\d+$/.test(idParam)) {
        publisherId = idParam;
        profileUrl = `https://www.facebook.com/profile.php?id=${publisherId}`;
      } else {
        // Đường dẫn dạng /username
        const pathname = parsed.pathname.replace(/^\/+|\/+$/g, '');
        if (pathname && !pathname.includes('/') && pathname !== 'profile.php') {
          profileUrl = `https://www.facebook.com/${pathname}`;
        } else {
          profileUrl = url.split('?')[0];
        }
      }
    } catch (e) {
      profileUrl = url.split('?')[0];
    }
  }

  return {
    profileUrl,
    publisherId
  };
}

/**
 * Làm sạch tên người đăng
 */
function cleanPublisherName(name) {
  if (!name || typeof name !== 'string') return null;
  // Chuẩn hóa Unicode NFC trước tiên
  let clean = name.normalize('NFC').replace(/<[^>]+>/g, '').trim();

  // Bỏ các ký tự zero-width, invisible unicode mà FB chèn vào
  clean = clean.replace(/[\u034f\u200b-\u200f\u202a-\u202e\ufeff]/g, '');

  // Bỏ các tiền tố nhãn nếu còn sót
  clean = clean.replace(/^(?:Được đăng bởi|Đăng bởi|Người đăng|Published by|Posted by)[:\s]*/i, '');
  // Bỏ dấu phân cách hoặc thông tin timestamp nếu bị dính
  clean = clean.replace(/[·•|].*$/, '');
  // Bỏ dấu hỏi chấm, ký hiệu trợ giúp tooltip ở cuối nếu có
  clean = clean.replace(/[\?？\uFFFD\s]+$/, '');
  clean = clean.replace(/\s+/g, ' ').trim();

  // Loại bỏ các từ rác hoặc quá dài/quá ngắn
  if (clean.length < 2 || clean.length > 60) return null;

  const blacklist = [
    'facebook', 'meta', 'quản trị viên', 'admin', 'chia sẻ',
    'bình luận', 'thích', 'comment', 'share', 'like', 'theo dõi', 'follow',
    'chỉ báo trạng thái', 'trạng thái online', 'đang hoạt động', 'bài viết của',
    'người kiểm duyệt', 'xem thêm'
  ];
  if (blacklist.some(b => clean.toLowerCase().includes(b))) {
    return null;
  }

  return clean;
}

/**
 * Lưu snapshot debug khi không tìm thấy thông tin hoặc gặp lỗi
 */
async function saveDebugSnapshot(page, postId, metadata = {}) {
  // Chỉ chụp ảnh màn hình và dump HTML khi bật DEBUG_SNAPSHOT hoặc DEBUG để tối ưu tốc độ crawl
  const shouldSave = process.env.DEBUG_SNAPSHOT === 'true' || config.DEBUG;
  if (!shouldSave) {
    return null;
  }

  try {
    const timestamp = Date.now();
    const safeId = (postId || `unknown_${timestamp}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const folderName = `${safeId}_${timestamp}`;
    const debugPath = path.resolve(config.DEBUG_DIR, folderName);

    if (!fs.existsSync(debugPath)) {
      fs.mkdirSync(debugPath, { recursive: true });
    }

    try {
      await page.screenshot({ path: path.resolve(debugPath, 'screenshot.png'), fullPage: false });
    } catch (e) {}

    try {
      const html = await page.content();
      fs.writeFileSync(path.resolve(debugPath, 'page.html'), html, 'utf8');
    } catch (e) {}

    try {
      const visibleText = await page.evaluate(() => document.body ? document.body.innerText : '');
      fs.writeFileSync(path.resolve(debugPath, 'visible-text.txt'), visibleText, 'utf8');
    } catch (e) {}

    const metaDataToSave = {
      url: page.url(),
      postId: postId || null,
      timestamp: new Date().toISOString(),
      status: metadata.status || 'NOT_FOUND',
      reason: metadata.reason || 'Không tìm thấy vùng thông tin người đăng'
    };
    fs.writeFileSync(path.resolve(debugPath, 'meta.json'), JSON.stringify(metaDataToSave, null, 2), 'utf8');

    return debugPath;
  } catch (err) {
    console.warn('[Debug] Lỗi khi lưu snapshot debug:', err.message);
    return null;
  }
}

/**
 * Detector trích xuất thông tin người đăng (Publisher) từ trang bài viết Facebook
 * @param {import('playwright').Page} page
 * @param {Object} options
 * @param {string} options.postId
 * @param {string} options.pageName - tên fanpage (để loại trừ nếu có)
 * @returns {Promise<Object>}
 */
async function detectPublisher(page, options = {}) {
  const postId = options.postId || null;
  const pageName = options.pageName || null;

  try {
    // Đợi giao diện Facebook hiển thị bài viết hoặc nhãn người đăng (tối đa 2.5s thay vì 10s để tối ưu tốc độ)
    try {
      await page.waitForFunction(() => {
        const hasContainer = !!document.querySelector('div[role="article"], div[role="main"], div[role="feed"]');
        const text = document.body ? (document.body.textContent || '') : '';
        const hasPublisher = /người đăng|được đăng bởi|đăng bởi|published by|posted by/i.test(text);
        const hasReaction = !!document.querySelector('[aria-label="Thích"], [aria-label="Like"], [aria-label="Gỡ Thích"], [aria-label="Remove Like"]');
        return hasPublisher || (hasContainer && hasReaction);
      }, { timeout: 2500 });
      await sleep(50);
    } catch (e) {}

    // Hàm đánh giá trích xuất trực tiếp trong context của trình duyệt (Zero-Layout-Thrashing)
    const evaluateInPage = (fanpageNameToExclude) => {
      function isExcludedName(text) {
        if (!text) return true;
        const lower = text.trim().toLowerCase();
        if (fanpageNameToExclude && lower === fanpageNameToExclude.trim().toLowerCase()) return true;
        const black = [
          'facebook', 'meta', 'bình luận', 'chia sẻ', 'thích', 'like', 'share',
          'comment', 'theo dõi', 'follow', 'quản trị viên', 'chỉ báo trạng thái',
          'trạng thái online', 'đang hoạt động', 'bài viết của', 'người kiểm duyệt'
        ];
        return black.some(b => lower.includes(b));
      }

      // Kiểm tra nhanh bằng textContent (siêu tốc < 0.1ms, không gây layout reflow)
      const fullTextContent = document.body ? (document.body.textContent || '') : '';

      // 2.1 Kiểm tra trạng thái bài viết không khả dụng
      const unavailablePatterns = [
        'Nội dung này hiện không khả dụng',
        "This content isn't available right now",
        'Trang này không khả dụng',
        'Liên kết có thể bị hỏng',
        'May have been removed'
      ];
      for (const p of unavailablePatterns) {
        if (fullTextContent.includes(p)) {
          return {
            status: 'POST_UNAVAILABLE',
            reason: `Bài viết không khả dụng hoặc đã bị xóa (${p})`
          };
        }
      }

      // 2.2 Kiểm tra trạng thái yêu cầu đăng nhập
      const hasLoginInput = document.querySelector('input[name="email"], input[id="email"], button[name="login"]');
      if (hasLoginInput) {
        return {
          status: 'LOGIN_REQUIRED',
          reason: 'Phiên Facebook đã hết hạn. Hãy chạy: npm run login'
        };
      }

      // 2.3 Trích xuất chỉ số tương tác (Likes/Reactions, Comments, Shares, PostType)
      function extractMetricsAndType() {
        let likes = 0;
        let comments = 0;
        let shares = 0;
        let postType = null;

        function parseCount(text) {
          if (!text || typeof text !== 'string') return 0;
          const clean = text.trim().replace(/[\u034f\u200b-\u200f\u202a-\u202e\ufeff]/g, '');
          const m = clean.match(/([\d,.]+)\s*([kKmM]?)/);
          if (!m) return 0;
          let val = m[1];
          const unit = (m[2] || '').toLowerCase();
          if (unit === 'k') {
            val = val.replace(',', '.');
            return Math.round(parseFloat(val) * 1000);
          }
          if (unit === 'm') {
            val = val.replace(',', '.');
            return Math.round(parseFloat(val) * 1000000);
          }
          if (/^\d{1,3}[,.]\d{3}$/.test(val)) {
            val = val.replace(/[,.]/g, '');
          }
          const parsed = parseInt(val, 10);
          return isNaN(parsed) ? 0 : parsed;
        }

        // Lọc đúng modal bài viết, loại bỏ các popup thông báo hoặc chat
        const validDialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(d => {
          const aria = (d.getAttribute('aria-label') || '').toLowerCase();
          return !aria.includes('thông báo') && !aria.includes('notification') && !aria.includes('chat') && !aria.includes('tin nhắn');
        });
        const postContainer = (validDialogs.length > 0 ? validDialogs[validDialogs.length - 1] : null) || document.querySelector('div[role="main"]') || document.body;

        // Phân loại bài viết (ORIGINAL hay SHARED)
        const shareIndicators = [
          'đã chia sẻ một bài viết',
          'đã chia sẻ bài viết',
          'đã chia sẻ liên kết',
          'đã chia sẻ một kỷ niệm',
          'shared a post',
          'shared a link'
        ];
        const lowerContainerText = (postContainer.textContent || '').toLowerCase();
        const isShared = shareIndicators.some(ind => lowerContainerText.includes(ind));
        if (isShared) {
          postType = 'SHARED';
        }

        // Lọc các nút tương tác an toàn
        function scanInteractiveButtons(container) {
          return Array.from(container.querySelectorAll('[role="button"], [aria-label]')).filter(b => {
            if (b.closest('header, div[role="banner"], div[role="navigation"], [aria-label*="Thông báo"], [aria-label*="Notifications"], [aria-label*="Chat"]')) return false;
            if (b.closest('[aria-label*="Bình luận dưới tên"], [aria-label*="Bình luận của"]')) return false;
            return true;
          });
        }

        const candidateButtons = scanInteractiveButtons(postContainer);

        for (const b of candidateButtons) {
          const aria = (b.getAttribute('aria-label') || '').trim();
          const lowerAria = aria.toLowerCase();
          const txt = (b.textContent || b.innerText || '').trim();

          // 1. Likes / Reactions / Thả tim / Cảm xúc
          if (/^(?:thích|gỡ thích|yêu thích|gỡ yêu thích|thương thương|haha|wow|buồn|phẫn nộ|like|remove like)$/i.test(aria)) {
            const c = parseCount(txt);
            if (c > likes) likes = c;
          } else if (
            lowerAria.includes('cảm xúc') ||
            lowerAria.includes('người khác') ||
            lowerAria.includes('thích:') ||
            lowerAria.includes('yêu thích:') ||
            lowerAria.includes('others') ||
            lowerAria.includes('all reactions') ||
            lowerAria.includes('bày tỏ cảm xúc')
          ) {
            const c = parseCount(aria) || parseCount(txt);
            if (c > likes) likes = c;
          }

          // 2. Comments / Bình luận
          if (lowerAria.includes('bình luận') || lowerAria.includes('viết bình luận') || lowerAria.includes('comment')) {
            const c = parseCount(txt) || parseCount(aria);
            if (c > comments) comments = c;
          }

          // 3. Shares / Chia sẻ
          if (lowerAria.includes('chia sẻ') || lowerAria.includes('gửi nội dung này') || lowerAria.includes('share')) {
            const c = parseCount(txt) || parseCount(aria);
            if (c > shares) shares = c;
          }
        }

        // Nếu chưa tìm thấy likes/reactions trong container, quét mở rộng toàn body (loại trừ header & popup)
        if (likes === 0) {
          const pageWideButtons = scanInteractiveButtons(document.body);
          for (const b of pageWideButtons) {
            const aria = (b.getAttribute('aria-label') || '').trim();
            const lowerAria = aria.toLowerCase();
            const txt = (b.textContent || b.innerText || '').trim();
            if (/^(?:thích|gỡ thích|yêu thích|gỡ yêu thích|thương thương|haha|wow|buồn|phẫn nộ|like|remove like)$/i.test(aria)) {
              const c = parseCount(txt);
              if (c > likes) likes = c;
            } else if (
              lowerAria.includes('cảm xúc') ||
              lowerAria.includes('người khác') ||
              lowerAria.includes('thích:') ||
              lowerAria.includes('yêu thích:') ||
              lowerAria.includes('others') ||
              lowerAria.includes('all reactions')
            ) {
              const c = parseCount(aria) || parseCount(txt);
              if (c > likes) likes = c;
            }
          }
        }

        // Fallback: Quét các span văn bản tóm tắt số bình luận / chia sẻ nếu chưa có
        if (comments === 0 || shares === 0) {
          const textElements = Array.from(postContainer.querySelectorAll('span, div')).filter(el => el.children.length === 0);
          for (const el of textElements) {
            const t = (el.textContent || '').trim();
            if (!t) continue;
            const lower = t.toLowerCase();
            if (comments === 0 && (lower.includes('bình luận') || lower.includes('comment'))) {
              const c = parseCount(t);
              if (c > 0) comments = c;
            }
            if (shares === 0 && (lower.includes('chia sẻ') || lower.includes('lượt chia sẻ') || lower.includes('share'))) {
              const c = parseCount(t);
              if (c > 0) shares = c;
            }
          }
        }

        return { likes, comments, shares, postType };
      }

      const metricsAndType = extractMetricsAndType();

      // Kiểm tra nhanh: Nếu trang hoàn toàn không có bất kỳ từ khóa publisher nào, kết thúc ngay trong < 0.1ms!
      const labelKeywords = [
        'người đăng:',
        'người đăng',
        'được đăng bởi:',
        'được đăng bởi',
        'đăng bởi:',
        'đăng bởi',
        'published by:',
        'published by',
        'posted by:',
        'posted by'
      ];
      const hasAnyLabel = /(?:người đăng|được đăng bởi|đăng bởi|published by|posted by)/i.test(fullTextContent);
      if (!hasAnyLabel) {
        return {
          status: 'NOT_FOUND',
          reason: 'Không tìm thấy nhãn người đăng trong nội dung trang',
          metrics: metricsAndType
        };
      }

      // ==========================================
      // STRATEGY 1: TreeWalker trích xuất qua TextNodes cực nhanh (0.5ms, ZERO layout reflow)
      // ==========================================
      const searchRoots = [];
      const validDialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(d => {
        const aria = (d.getAttribute('aria-label') || '').toLowerCase();
        return !aria.includes('thông báo') && !aria.includes('notification') && !aria.includes('chat') && !aria.includes('tin nhắn');
      });
      if (validDialogs.length > 0) searchRoots.push(validDialogs[validDialogs.length - 1]);
      const article = document.querySelector('div[role="article"]');
      if (article && !searchRoots.includes(article)) searchRoots.push(article);
      const main = document.querySelector('div[role="main"]');
      if (main && !searchRoots.includes(main)) searchRoots.push(main);
      searchRoots.push(document.body);

      for (const root of searchRoots) {
        if (!root) continue;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        let textNode;
        while ((textNode = walker.nextNode())) {
          const rawVal = (textNode.nodeValue || '').normalize('NFC').replace(/[\u034f\u200b-\u200f\u202a-\u202e\ufeff]/g, '').trim();
          if (!rawVal) continue;
          const lowerVal = rawVal.toLowerCase();

          for (const kw of labelKeywords) {
            if (lowerVal.includes(kw)) {
              const el = textNode.parentElement;
              if (!el) continue;

              // 1.1 Kiểm tra text phía sau keyword ngay trên textNode hoặc element
              const cleanAfterKw = rawVal.substring(lowerVal.indexOf(kw) + kw.length).trim();
              if (cleanAfterKw) {
                const firstLine = cleanAfterKw.split(/[\n\r·•]/)[0].replace(/[\?？\uFFFD\s]+$/, '').trim();
                if (firstLine.length >= 2 && firstLine.length <= 60 && !isExcludedName(firstLine)) {
                  let matchingAnchor = el.querySelector ? el.querySelector('a') : null;
                  if (!matchingAnchor && el.nextElementSibling) {
                    matchingAnchor = el.nextElementSibling.tagName === 'A' ? el.nextElementSibling : el.nextElementSibling.querySelector('a');
                  }
                  return {
                    status: 'FOUND',
                    name: firstLine,
                    href: matchingAnchor ? matchingAnchor.href : null,
                    rawText: rawVal.substring(0, 100),
                    method: matchingAnchor ? 'published-by-matched-anchor' : 'published-by-fast-text',
                    metrics: metricsAndType
                  };
                }
              }

              // 1.2 Kiểm tra thẻ <a> lân cận
              const directAnchor = el.closest ? (el.tagName === 'A' ? el : el.querySelector('a')) : null;
              if (directAnchor) {
                const aText = (directAnchor.textContent || directAnchor.innerText || '').trim();
                if (aText.length >= 2 && aText.length <= 60 && !isExcludedName(aText)) {
                  return {
                    status: 'FOUND',
                    name: aText,
                    href: directAnchor.href,
                    rawText: rawVal.substring(0, 100),
                    method: 'published-by-treewalker-anchor',
                    metrics: metricsAndType
                  };
                }
              }

              // 1.3 Kiểm tra sibling tiếp theo của thẻ chứa nhãn
              let nextEl = el.nextElementSibling;
              if (nextEl) {
                const nextAnchor = nextEl.tagName === 'A' ? nextEl : (nextEl.querySelector ? nextEl.querySelector('a') : null);
                const nextText = ((nextAnchor ? nextAnchor.textContent : nextEl.textContent) || '').trim();
                const cleanNextText = nextText.split(/[\n\r·•]/)[0].replace(/[\?？\uFFFD\s]+$/, '').trim();
                if (cleanNextText.length >= 2 && cleanNextText.length <= 60 && !isExcludedName(cleanNextText)) {
                  return {
                    status: 'FOUND',
                    name: cleanNextText,
                    href: nextAnchor ? nextAnchor.href : null,
                    rawText: `${rawVal} ${cleanNextText}`,
                    method: 'published-by-treewalker-sibling',
                    metrics: metricsAndType
                  };
                }
              }
            }
          }
        }
      }

      // ==========================================
      // STRATEGY 2: Fallback Regex trên toàn bộ HTML của trang
      // ==========================================
      const pageHtml = document.body ? document.body.innerHTML : '';
      const htmlRegex = /(?:Người đăng|Đăng bởi|Được đăng bởi|Published by|Posted by)[:\s]*<[^>]*>*\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
      const htmlMatch = pageHtml.match(htmlRegex);
      if (htmlMatch && htmlMatch[2]) {
        const rawName = htmlMatch[2].replace(/<[^>]+>/g, '').trim();
        if (rawName.length >= 2 && rawName.length <= 60 && !isExcludedName(rawName)) {
          return {
            status: 'FOUND',
            name: rawName,
            href: htmlMatch[1].replace(/&amp;/g, '&'),
            rawText: `Người đăng: ${rawName}`,
            method: 'published-by-html-anchor-regex',
            metrics: metricsAndType
          };
        }
      }

      // ==========================================
      // STRATEGY 3: Fallback Regex trên fullTextContent
      // ==========================================
      const fallbackRegex = /(?:Người đăng|Được đăng bởi|Đăng bởi|Published by|Posted by)[:\s]+([^·•\n\r|]{2,60})/i;
      const match = fullTextContent.match(fallbackRegex);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (candidate.length >= 2 && !isExcludedName(candidate)) {
          return {
            status: 'FOUND',
            name: candidate,
            href: null,
            rawText: match[0].trim(),
            method: 'published-by-body-regex',
            metrics: metricsAndType
          };
        }
      }

      return {
        status: 'NOT_FOUND',
        reason: 'Không tìm thấy vùng thông tin người đăng',
        metrics: metricsAndType
      };
    };

    let evaluation = await page.evaluate(evaluateInPage, pageName);

    // In-Page Retry: Nếu chưa tìm thấy và không phải lỗi phiên/lỗi bài, cuộn nhẹ 250px và quét lại
    if (evaluation.status !== 'FOUND' && evaluation.status !== 'LOGIN_REQUIRED' && evaluation.status !== 'POST_UNAVAILABLE') {
      try {
        await page.evaluate(() => window.scrollBy(0, 250));
        await sleep(250);
        const retryEval = await page.evaluate(evaluateInPage, pageName);
        if (retryEval && retryEval.status === 'FOUND') {
          evaluation = retryEval;
        }
      } catch (e) {}
    }

    const extractedMetrics = evaluation.metrics || {};
    const likes = typeof extractedMetrics.likes === 'number' ? extractedMetrics.likes : null;
    const comments = typeof extractedMetrics.comments === 'number' ? extractedMetrics.comments : null;
    const shares = typeof extractedMetrics.shares === 'number' ? extractedMetrics.shares : null;
    const postType = extractedMetrics.postType || null;

    // 3. Xử lý kết quả từ evaluate
    if (evaluation.status === 'FOUND') {
      const cleanName = cleanPublisherName(evaluation.name);
      if (cleanName) {
        const { profileUrl, publisherId } = parseProfileInfo(evaluation.href, cleanName);
        return {
          status: 'FOUND',
          name: cleanName,
          id: publisherId,
          profileUrl,
          rawText: evaluation.rawText || `Đăng bởi ${cleanName}`,
          method: evaluation.method || 'published-by-label',
          likes,
          comments,
          shares,
          postType
        };
      }
    }

    if (evaluation.status === 'POST_UNAVAILABLE') {
      return {
        status: 'POST_UNAVAILABLE',
        name: null,
        id: null,
        profileUrl: null,
        rawText: null,
        method: null,
        reason: evaluation.reason,
        likes,
        comments,
        shares,
        postType
      };
    }

    if (evaluation.status === 'LOGIN_REQUIRED') {
      return {
        status: 'LOGIN_REQUIRED',
        name: null,
        id: null,
        profileUrl: null,
        rawText: null,
        method: null,
        reason: evaluation.reason
      };
    }

    // 4. Nếu NOT_FOUND, lưu debug snapshot
    const debugPath = await saveDebugSnapshot(page, postId, {
      status: 'NOT_FOUND',
      reason: evaluation.reason || 'Không tìm thấy nhãn hoặc thông tin người đăng'
    });

    return {
      status: 'NOT_FOUND',
      name: null,
      id: null,
      profileUrl: null,
      rawText: null,
      method: null,
      reason: evaluation.reason || 'Không tìm thấy vùng thông tin người đăng',
      debugPath,
      likes,
      comments,
      shares,
      postType
    };
  } catch (error) {
    const debugPath = await saveDebugSnapshot(page, postId, {
      status: 'ERROR',
      reason: error.message
    });

    return {
      status: 'ERROR',
      name: null,
      id: null,
      profileUrl: null,
      rawText: null,
      method: null,
      reason: `Lỗi khi phát hiện người đăng: ${error.message}`,
      debugPath
    };
  }
}

module.exports = {
  detectPublisher,
  cleanPublisherName,
  parseProfileInfo,
  saveDebugSnapshot
};
