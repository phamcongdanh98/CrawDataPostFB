/**
 * Dịch vụ kết nối và gửi thông báo qua Telegram Bot API
 */

/**
 * Gửi một tin nhắn tới Telegram Chat ID
 * @param {Object} options
 * @param {string} options.token - Telegram Bot Token
 * @param {string|number} options.chatId - Telegram Chat ID
 * @param {string} options.text - Nội dung tin nhắn (hỗ trợ HTML)
 * @param {string} [options.parseMode='HTML']
 * @returns {Promise<{ok: boolean, result?: any, error?: string}>}
 */
async function sendTelegramMessage(options = {}) {
  const { token, chatId, text, parseMode = 'HTML' } = options;

  if (!token || !String(token).trim()) {
    return { ok: false, error: 'Chưa cấu hình Telegram Bot Token.' };
  }
  if (!chatId || !String(chatId).trim()) {
    return { ok: false, error: 'Chưa cấu hình Telegram Chat ID.' };
  }
  if (!text || !String(text).trim()) {
    return { ok: false, error: 'Nội dung tin nhắn không được để trống.' };
  }

  const cleanToken = String(token).trim();
  const cleanChatId = String(chatId).trim();
  const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(15000)
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      const errMsg = data?.description || `HTTP ${res.status} ${res.statusText}`;
      return { ok: false, error: `Lỗi Telegram API: ${errMsg}` };
    }

    return { ok: true, result: data.result };
  } catch (err) {
    return { ok: false, error: `Không thể kết nối tới Telegram: ${err.message}` };
  }
}

/**
 * Kiểm tra kết nối Telegram Bot và gửi tin nhắn chào mừng thử nghiệm
 * @param {string} token
 * @param {string|number} chatId
 */
async function testTelegramConnection(token, chatId) {
  const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const testMessage = `
🤖 <b>KIỂM TRA KẾT NỐI TELEGRAM BOT THÀNH CÔNG!</b>

✅ Hệ thống quản lý và trích xuất Fanpage đã liên kết thành công với nhóm/kênh này.
⏰ <b>Thời gian:</b> <code>${nowStr}</code>

🔔 Bạn sẽ nhận được báo cáo tự động tại đây mỗi khi hoàn thành chu kỳ đồng bộ dữ liệu.
  `.trim();

  return await sendTelegramMessage({
    token,
    chatId,
    text: testMessage,
    parseMode: 'HTML'
  });
}

/**
 * Định dạng và gửi báo cáo kết quả đợt đồng bộ qua Telegram
 * @param {Object} reportData
 * @param {Object} configObj
 */
async function sendSyncReport(reportData, configObj = {}) {
  const token = configObj.token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = configObj.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { ok: false, error: 'Chưa cấu hình Telegram Bot Token hoặc Chat ID.' };
  }

  const {
    pageName = 'Fanpage',
    since,
    until,
    totalPosts = 0,
    insertedCount = 0,
    foundPublishers = 0,
    totalLikes = 0,
    totalComments = 0,
    totalShares = 0,
    topPublishers = [],
    topPosts = [],
    durationSec = 0
  } = reportData;

  const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const totalEngagements = totalLikes + totalComments + totalShares;

  let topPubText = '';
  if (Array.isArray(topPublishers) && topPublishers.length > 0) {
    topPubText = '\n🏆 <b>Top Quản trị viên đăng bài:</b>\n' +
      topPublishers.slice(0, 3).map((p, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
        const likesNum = p.total_likes || 0;
        return `${medal} <b>${escapeHtml(p.publisher_name)}</b>: ${p.post_count} bài (❤️ ${likesNum.toLocaleString()} tương tác)`;
      }).join('\n') + '\n';
  }

  let topPostsText = '';
  if (Array.isArray(topPosts) && topPosts.length > 0) {
    topPostsText = '\n🔥 <b>Bài viết tương tác cao nhất:</b>\n' +
      topPosts.slice(0, 2).map((post, idx) => {
        const preview = post.message ? post.message.substring(0, 65).replace(/\n/g, ' ') + '...' : 'Không có tiêu đề';
        const url = post.permalink_url || `https://facebook.com/${post.id}`;
        return `${idx + 1}. <a href="${url}">${escapeHtml(preview)}</a>\n   └ ❤️ ${post.likes_count || 0} | 💬 ${post.comments_count || 0} | 🔁 ${post.shares_count || 0}`;
      }).join('\n') + '\n';
  }

  const message = `
🚀 <b>BÁO CÁO ĐỒNG BỘ FANPAGE HOÀN TẤT</b>

📌 <b>Trang:</b> <b>${escapeHtml(pageName)}</b>
⏰ <b>Thời gian:</b> <code>${nowStr}</code> (Xử lý: ${durationSec}s)
📅 <b>Khoảng ngày:</b> <code>${since}</code> ➔ <code>${until}</code>

📊 <b>Kết quả xử lý:</b>
• Tổng bài trong kỳ: <b>${totalPosts.toLocaleString()}</b> bài
• Bài viết mới thêm: <b>${insertedCount.toLocaleString()}</b> bài
• Đã xác định tác giả: <b>${foundPublishers.toLocaleString()}</b> bài

📈 <b>Tương tác ghi nhận:</b>
• ❤️ Thích / Cảm xúc: <b>${totalLikes.toLocaleString()}</b>
• 💬 Bình luận: <b>${totalComments.toLocaleString()}</b>
• 🔁 Lượt chia sẻ: <b>${totalShares.toLocaleString()}</b>
• 🌟 <b>Tổng tương tác: ${totalEngagements.toLocaleString()}</b>
${topPubText}${topPostsText}
🔗 <i>Hệ thống Fanpage Stat & Publisher Crawler tự động</i>
  `.trim();

  return await sendTelegramMessage({
    token,
    chatId,
    text: message,
    parseMode: 'HTML'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  sendTelegramMessage,
  testTelegramConnection,
  sendSyncReport
};
