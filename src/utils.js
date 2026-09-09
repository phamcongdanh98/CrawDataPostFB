/**
 * Các tiện ích xử lý ngày tháng, chuỗi, token và thời gian chờ
 */

/**
 * Ẩn Access Token trong URL hoặc chuỗi văn bản
 */
function maskToken(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/(access_token=)([^&]+)/gi, '$1[HIDDEN_TOKEN]');
}

/**
 * Chuẩn hóa chuỗi ngày nhập vào (hỗ trợ cả DD/MM/YYYY và YYYY-MM-DD) sang định dạng YYYY-MM-DD chuẩn
 */
function normalizeDateStr(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();

  // Dạng DD/MM/YYYY hoặc D/M/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Dạng YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Kiểm tra định dạng ngày hợp lệ (hỗ trợ DD/MM/YYYY hoặc YYYY-MM-DD)
 */
function isValidDateFormat(dateStr) {
  const normalized = normalizeDateStr(dateStr);
  if (!normalized) return false;
  const d = new Date(normalized);
  return !isNaN(d.getTime());
}

/**
 * Kiểm tra khoảng ngày hợp lệ (since <= until)
 */
function isDateRangeValid(since, until) {
  const normSince = normalizeDateStr(since);
  const normUntil = normalizeDateStr(until);
  if (!normSince || !normUntil) return false;
  return normSince <= normUntil;
}

/**
 * Chuyển ngày theo múi giờ Việt Nam (UTC+7) sang Unix timestamp (giây) cho Meta Graph API
 * @param {string} dateStr - 'DD/MM/YYYY' hoặc 'YYYY-MM-DD'
 * @param {boolean} isEndOfDay - nếu true, lấy 23:59:59, ngược lại 00:00:00
 * @returns {number} Unix timestamp tính bằng giây
 */
function vnDateToUtcTimestamp(dateStr, isEndOfDay = false) {
  const normalized = normalizeDateStr(dateStr);
  if (!normalized) throw new Error(`Định dạng ngày không hợp lệ: ${dateStr}`);
  const timePart = isEndOfDay ? '23:59:59' : '00:00:00';
  const vnIso = `${normalized}T${timePart}+07:00`;
  const date = new Date(vnIso);
  return Math.floor(date.getTime() / 1000);
}

/**
 * Định dạng UTC timestamp từ Graph API sang chuỗi ngày giờ Việt Nam chuẩn dd/mm/yyyy HH:mm:ss
 * @param {string|Date} dateInput
 * @returns {string} ví dụ: '01/07/2026 14:30:25'
 */
function formatVNDate(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  try {
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const map = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}:${map.second}`;
  } catch (e) {
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }
}

/**
 * Định dạng ngày chỉ lấy dd/mm/yyyy
 */
function formatVNDateOnly(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  try {
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const map = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    return `${map.day}/${map.month}/${map.year}`;
  } catch (e) {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Tạm dừng mili giây
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sinh khoảng chờ ngẫu nhiên giữa min và max
 */
function getRandomDelay(minMs, maxMs) {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Rút gọn chuỗi văn bản cho preview
 */
function truncate(str, maxLen = 150) {
  if (!str) return '';
  const clean = str.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen) + '...';
}

/**
 * Escape chuỗi cho file CSV
 */
function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Chuẩn hóa URL bài viết Facebook chuẩn canonical
 * Sử dụng định dạng: https://www.facebook.com/permalink.php?story_fbid=${storyFbid}&id=${pageId}
 * Giúp người dùng mở bài viết trực tiếp luôn thành công, không bị lỗi 404 do App-Scoped ID từ Graph API
 * @param {Object|string} postOrId - Đối tượng post hoặc ID post dạng pageId_storyFbid
 * @param {string} [maybePageId] - ID fanpage
 * @returns {string} URL bài viết chuẩn
 */
function getCanonicalPostUrl(postOrId, maybePageId) {
  if (!postOrId) return '';
  const id = typeof postOrId === 'object' ? postOrId.id : postOrId;
  const pageId = (typeof postOrId === 'object' ? postOrId.page_id : maybePageId) || '';

  if (typeof id === 'string' && id.includes('_')) {
    const parts = id.split('_');
    const pid = pageId || parts[0];
    const storyFbid = parts[1];
    if (pid && storyFbid) {
      return `https://www.facebook.com/permalink.php?story_fbid=${storyFbid}&id=${pid}`;
    }
  }
  if (typeof postOrId === 'object' && postOrId.permalink_url) {
    return postOrId.permalink_url;
  }
  return typeof postOrId === 'string' ? postOrId : '';
}

module.exports = {
  maskToken,
  normalizeDateStr,
  isValidDateFormat,
  isDateRangeValid,
  vnDateToUtcTimestamp,
  formatVNDate,
  formatVNDateOnly,
  sleep,
  getRandomDelay,
  truncate,
  escapeCsvField,
  getCanonicalPostUrl
};

