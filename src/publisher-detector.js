const fs = require('fs');
const path = require('path');
const config = require('./config');
const { sleep } = require('./utils');

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
    // Đợi giao diện Facebook hiển thị nút Thích/Reaction HOẶC nhãn người đăng (tối đa 10s)
    try {
      await page.waitForFunction(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const hasPublisherLabel = /người đăng|được đăng bởi|đăng bởi|published by|posted by/i.test(bodyText);
        const hasReactionBtn = !!document.querySelector('[aria-label="Thích"], [aria-label="Like"], [aria-label="Gỡ Thích"], [aria-label="Remove Like"]');
        return hasPublisherLabel || hasReactionBtn;
      }, { timeout: 10000 });
      await sleep(350);
    } catch (e) {}

    // Hàm đánh giá trích xuất trực tiếp trong context của trình duyệt
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

      // Đọc visible text một lần duy nhất để tối ưu hiệu năng layout
      const bodyText = document.body ? document.body.innerText : '';

      // 2.1 Kiểm tra trạng thái bài viết không khả dụng
      const unavailablePatterns = [
        'Nội dung này hiện không khả dụng',
        "This content isn't available right now",
        'Trang này không khả dụng',
        'Liên kết có thể bị hỏng',
        'May have been removed'
      ];
      for (const p of unavailablePatterns) {
        if (bodyText.includes(p)) {
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

      // 2.3 Trích xuất chỉ số tương tác (Likes/Reactions, Comments, Shares)
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

        // Bóc tách cô lập trong phạm vi nội dung chính (mainArea)
        // Loại trừ tuyệt đối header bar, navigation bar, popup thông báo, và danh sách comment
        const mainArea = document.querySelector('div[role="main"]') || document.body;
        const candidateButtons = Array.from(mainArea.querySelectorAll('[role="button"]')).filter(b => {
          if (b.closest('header, div[role="banner"], div[role="navigation"], [aria-label*="Thông báo"], [aria-label*="Notifications"]')) return false;
          if (b.closest('[aria-label*="Bình luận dưới tên"], [aria-label*="Bình luận của"]')) return false;
          return true;
        });

        // 1. Tìm nút reaction/Thích của bài viết chính
        const reactBtn = candidateButtons.find(b => {
          const aria = (b.getAttribute('aria-label') || '').trim();
          return /^(?:Thích|Gỡ Thích|Yêu thích|Gỡ Yêu thích|Thương thương|Haha|Wow|Buồn|Phẫn nộ|Like|Remove Like)$/i.test(aria);
        });

        if (reactBtn) {
          // Tìm thanh action bar (container chứa cụm 3 nút Thích, Bình luận, Chia sẻ)
          let actionBar = reactBtn.parentElement;
          for (let i = 0; i < 5; i++) {
            if (actionBar && actionBar.children.length >= 3) break;
            if (actionBar && actionBar.parentElement) actionBar = actionBar.parentElement;
          }

          if (actionBar) {
            Array.from(actionBar.children).forEach(child => {
              const btn = child.getAttribute('role') === 'button' ? child : child.querySelector('[role="button"]');
              const target = btn || child;
              const aria = (target.getAttribute('aria-label') || '').trim().toLowerCase();
              const txt = (target.innerText || '').trim();

              if (/^(?:thích|gỡ thích|yêu thích|gỡ yêu thích|thương thương|haha|wow|buồn|phẫn nộ|like|remove like)$/i.test(aria)) {
                likes = parseCount(txt);
              } else if (aria.includes('bình luận') || aria.includes('viết bình luận') || aria.includes('comment')) {
                comments = parseCount(txt);
              } else if (aria.includes('chia sẻ') || aria.includes('gửi nội dung này') || aria.includes('share')) {
                shares = parseCount(txt);
              }
            });

            // Nếu nút Thích không hiển thị số trực tiếp (Facebook hiển thị số lượng ở dòng tổng hợp cảm xúc phía trên)
            if (likes === 0 && actionBar.parentElement) {
              const aboveArea = actionBar.parentElement;
              const summaryReact = aboveArea.querySelector('[role="button"][aria-label*="cảm xúc"], [role="button"][aria-label*="người khác"], [role="button"][aria-label*="thích:"]');
              if (summaryReact) {
                const parsed = parseCount(summaryReact.getAttribute('aria-label')) || parseCount(summaryReact.innerText);
                if (parsed > 0) likes = parsed;
              }
            }
          }
        }

        return { likes, comments, shares, postType };
      }

      const metricsAndType = extractMetricsAndType();

      // 2.4 Các cụm từ khóa nhận diện người đăng
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

      // Ưu tiên container bài viết: nếu có modal dialog (role="dialog") thì quét dialog trước,
      // sau đó đến role="main", role="article", cuối cùng là toàn bộ document.body
      const searchRoots = [];
      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) searchRoots.push(dialog);

      const article = document.querySelector('div[role="article"]');
      if (article && !searchRoots.includes(article)) searchRoots.push(article);

      const main = document.querySelector('div[role="main"]');
      if (main && !searchRoots.includes(main)) searchRoots.push(main);

      searchRoots.push(document.body);

      for (const root of searchRoots) {
        if (!root) continue;

        // ==========================================
        // STRATEGY 1: Quét các element có text chứa nhãn (ưu tiên thẻ nhỏ nhất, gần nhất)
        // ==========================================
        const allElements = Array.from(root.querySelectorAll('div, span, p, a, strong, b'));
        const candidates = [];
        for (const el of allElements) {
          const rawText = (el.innerText || '').normalize('NFC').replace(/[\u034f\u200b-\u200f\u202a-\u202e\ufeff]/g, '').trim();
          if (!rawText) continue;
          const lower = rawText.toLowerCase();

          for (const kw of labelKeywords) {
            if (lower.includes(kw)) {
              candidates.push({ el, text: rawText, lower, kw });
              break;
            }
          }
        }

        // Sắp xếp tăng dần theo độ dài text để xử lý thẻ con sâu nhất trước
        candidates.sort((a, b) => a.text.length - b.text.length);

        for (const { el, text, lower, kw } of candidates) {
          // 1.1 Tách text trực tiếp sau từ khóa (chính xác nhất khi đã ở element nhỏ nhất)
          const cleanAfterKw = text.substring(lower.indexOf(kw) + kw.length).trim();
          if (cleanAfterKw) {
            const firstLine = cleanAfterKw.split(/[\n\r·•]/)[0].replace(/[\?？\uFFFD\s]+$/, '').trim();
            if (firstLine.length >= 2 && firstLine.length <= 60 && !isExcludedName(firstLine)) {
              const elAnchors = Array.from(el.querySelectorAll('a'));
              let matchingAnchor = elAnchors.find(a => (a.innerText || '').trim() === firstLine);
              if (!matchingAnchor && el.nextElementSibling) {
                const nextA = el.nextElementSibling.tagName === 'A' ? el.nextElementSibling : el.nextElementSibling.querySelector('a');
                if (nextA && ((nextA.innerText || '').trim() === firstLine || !elAnchors.length)) {
                  matchingAnchor = nextA;
                }
              }
              if (!matchingAnchor) {
                matchingAnchor = Array.from(root.querySelectorAll('a')).find(a => (a.innerText || '').trim() === firstLine);
              }

              return {
                status: 'FOUND',
                name: firstLine,
                href: matchingAnchor ? matchingAnchor.href : null,
                rawText: text.substring(0, 100),
                method: matchingAnchor ? 'published-by-name-matched-anchor' : 'published-by-text-split',
                metrics: metricsAndType
              };
            }
          }

          // 1.2 Kiểm tra xem bên trong el có thẻ <a> không
          const anchor = el.querySelector('a');
          if (anchor) {
            const aText = (anchor.innerText || '').trim();
            if (aText.length >= 2 && aText.length <= 60 && !isExcludedName(aText)) {
              return {
                status: 'FOUND',
                name: aText,
                href: anchor.href,
                rawText: text.substring(0, 100),
                method: 'published-by-inner-anchor',
                metrics: metricsAndType
              };
            }
          }

          // 1.3 Xét sibling tiếp theo
          let next = el.nextElementSibling;
          if (next) {
            const nextAnchor = next.tagName === 'A' ? next : next.querySelector('a');
            const nextText = ((nextAnchor ? nextAnchor.innerText : next.innerText) || '').trim();
            const cleanNextText = nextText.split(/[\n\r·•]/)[0].replace(/[\?？\uFFFD\s]+$/, '').trim();
            if (cleanNextText.length >= 2 && cleanNextText.length <= 60 && !isExcludedName(cleanNextText)) {
              return {
                status: 'FOUND',
                name: cleanNextText,
                href: nextAnchor ? nextAnchor.href : null,
                rawText: `${text} ${cleanNextText}`,
                method: 'published-by-sibling-anchor',
                metrics: metricsAndType
              };
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
      // STRATEGY 3: Fallback Regex trên toàn bộ visible text
      // ==========================================
      const fallbackRegex = /(?:Người đăng|Được đăng bởi|Đăng bởi|Published by|Posted by)[:\s]+([^·•\n\r|]{2,60})/i;
      const match = bodyText.match(fallbackRegex);
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

    // In-Page Retry: Nếu chưa tìm thấy và không phải lỗi phiên/lỗi bài, cuộn nhẹ 250px và đợi 1.2s rồi quét lại lần 2
    if (evaluation.status !== 'FOUND' && evaluation.status !== 'LOGIN_REQUIRED' && evaluation.status !== 'POST_UNAVAILABLE') {
      try {
        await page.evaluate(() => window.scrollBy(0, 250));
        await sleep(1200);
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
