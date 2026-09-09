const config = require('./config');

/**
 * Tự động phân giải và chuyển đổi Token (User Token -> Page Access Token)
 * @param {string} rawToken
 * @param {string} pageId
 * @param {string} version
 * @returns {Promise<{ok: boolean, token?: string, pageId?: string, pageName?: string, error?: string, converted?: boolean}>}
 */
async function resolvePageAccessToken(rawToken, pageId, version = 'v26.0') {
  if (!rawToken || !rawToken.trim()) {
    return { ok: false, error: 'Token không được để trống' };
  }
  const cleanToken = rawToken.trim();
  const cleanPageId = (pageId || '').trim();

  try {
    // 1. Kiểm tra đối tượng sở hữu token qua /me
    const meRes = await fetch(`https://graph.facebook.com/${version}/me?access_token=${cleanToken}`);
    const meData = await meRes.json();

    if (!meRes.ok || meData.error) {
      const errMsg = meData?.error?.message || `HTTP ${meRes.status}`;
      return { ok: false, error: `Token không hợp lệ hoặc đã hết hạn: ${errMsg}` };
    }

    // Nếu token chính là của Page
    if (cleanPageId && meData.id === cleanPageId) {
      return {
        ok: true,
        token: cleanToken,
        pageId: cleanPageId,
        pageName: meData.name || 'Fanpage',
        converted: false
      };
    }

    // Nếu là User Token, gọi /me/accounts để lấy Page Access Token
    const accountsRes = await fetch(`https://graph.facebook.com/${version}/me/accounts?access_token=${cleanToken}`);
    const accountsData = await accountsRes.json();

    if (!accountsRes.ok || accountsData.error) {
      const errMsg = accountsData?.error?.message || `HTTP ${accountsRes.status}`;
      return { ok: false, error: `Không thể đọc danh sách trang quản trị từ tài khoản: ${errMsg}` };
    }

    const pages = accountsData.data || [];
    if (pages.length === 0) {
      return {
        ok: false,
        error: `Tài khoản "${meData.name}" không quản trị Fanpage nào trên Facebook.`
      };
    }

    let targetPage = null;
    if (cleanPageId) {
      targetPage = pages.find((p) => p.id === cleanPageId);
    } else if (pages.length === 1) {
      // Nếu chưa nhập Page ID mà chỉ có 1 Page thì tự động chọn Page đó luôn
      targetPage = pages[0];
    }

    if (!targetPage) {
      const pageNames = pages.map((p) => `"${p.name}" (ID: ${p.id})`).join(', ');
      return {
        ok: false,
        error: `Tài khoản "${meData.name}" không quản trị Fanpage có ID "${cleanPageId}". Các trang bạn đang quản trị: ${pageNames}`
      };
    }

    return {
      ok: true,
      token: targetPage.access_token,
      pageId: targetPage.id,
      pageName: targetPage.name,
      converted: true
    };
  } catch (err) {
    return { ok: false, error: `Lỗi kết nối Facebook: ${err.message}` };
  }
}

module.exports = {
  resolvePageAccessToken
};
