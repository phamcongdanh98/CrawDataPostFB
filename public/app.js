/**
 * HỆ THỐNG QUẢN LÝ VÀ THỐNG KÊ BÀI VIẾT FANPAGE
 * Client Application Logic
 */

// State quản lý ứng dụng client
const state = {
  since: '', // Định dạng YYYY-MM-DD dùng cho API
  until: '', // Định dạng YYYY-MM-DD dùng cho API
  batchId: 'ALL',
  publisher: '',
  status: 'ALL',
  postType: 'ALL',
  search: '',
  sortBy: 'created_time',
  sortOrder: 'DESC',
  page: 1,
  limit: 20,
  totalPages: 1,
  currentTab: 'posts', // Mặc định mở tab bài viết để người dùng thấy ngay dữ liệu
  isJobRunning: false,
  pollingInterval: null,
  configuredPageId: null,
  configuredPageName: null,
  activePreset: '7days',
  currentPostsCache: [] // Lưu danh sách bài viết hiện tại để xem chi tiết nhanh
};

// ==========================================================================
// TOAST NOTIFICATION SYSTEM
// ==========================================================================
const toastContainer = document.getElementById('toastContainer');

function showToast({ type = 'info', title = '', message = '', duration = 3800 }) {
  if (!toastContainer) return;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button type="button" class="toast-close" title="Đóng">✕</button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const dismiss = () => {
    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  };

  closeBtn.addEventListener('click', dismiss);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  toastContainer.appendChild(toast);
}

// ==========================================================================
// DOM ELEMENTS TRUY CẬP
// ==========================================================================

// Form & Controls
const sinceDateInput = document.getElementById('sinceDate');
const untilDateInput = document.getElementById('untilDate');
const sinceDatePicker = document.getElementById('sinceDatePicker');
const untilDatePicker = document.getElementById('untilDatePicker');
const btnSinceCalendar = document.getElementById('btnSinceCalendar');
const btnUntilCalendar = document.getElementById('btnUntilCalendar');
const forceRecheckCheckbox = document.getElementById('forceRecheck');
const btnSyncPosts = document.getElementById('btnSyncPosts');
const btnDetectPublishers = document.getElementById('btnDetectPublishers');
const btnSyncAll = document.getElementById('btnSyncAll');
const btnExportExcel = document.getElementById('btnExportExcel');
const btnExportCsv = document.getElementById('btnExportCsv');

// Progress Notification Bar
const progressSection = document.getElementById('progressSection');
const progressBarFill = document.getElementById('progressBarFill');
const progressCountText = document.getElementById('progressCountText');
const progressCurrentMsg = document.getElementById('progressCurrentMsg');
const progressCurrentPub = document.getElementById('progressCurrentPub');
const progFound = document.getElementById('progFound');
const progNotFound = document.getElementById('progNotFound');
const progErrors = document.getElementById('progErrors');
const btnStopJob = document.getElementById('btnStopJob');

// 6 Metrics Cards
const statTotalPosts = document.getElementById('statTotalPosts');
const statOriginalPosts = document.getElementById('statOriginalPosts');
const statSharedPosts = document.getElementById('statSharedPosts');
const statFound = document.getElementById('statFound');
const statFoundBar = document.getElementById('statFoundBar');
const statFoundPercent = document.getElementById('statFoundPercent');
const statPending = document.getElementById('statPending');
const statNotFound = document.getElementById('statNotFound');
const statErrors = document.getElementById('statErrors');
const statTotalEngagements = document.getElementById('statTotalEngagements');
const statLikesCount = document.getElementById('statLikesCount');
const statCommentsCount = document.getElementById('statCommentsCount');
const statSharesCount = document.getElementById('statSharesCount');
const statPublishersCount = document.getElementById('statPublishersCount');
const btnGoToPublishersTab = document.getElementById('btnGoToPublishersTab');

// Navigation Tabs
const tabBtnPosts = document.getElementById('tabBtnPosts');
const tabBtnPublishers = document.getElementById('tabBtnPublishers');
const tabBtnBatches = document.getElementById('tabBtnBatches');
const tabPostsCount = document.getElementById('tabPostsCount');
const tabPubsCount = document.getElementById('tabPubsCount');
const tabBatchesCount = document.getElementById('tabBatchesCount');

// Views
const viewPosts = document.getElementById('viewPosts');
const viewPublishers = document.getElementById('viewPublishers');
const viewBatches = document.getElementById('viewBatches');

// View 1: Posts Table & Filters
const postsTableBody = document.getElementById('postsTableBody');
const filterBatchSelect = document.getElementById('filterBatchSelect');
const filterPostType = document.getElementById('filterPostType');
const filterPublisherSelect = document.getElementById('filterPublisherSelect');
const filterSearch = document.getElementById('filterSearch');
const btnClearSearch = document.getElementById('btnClearSearch');
const filterStatus = document.getElementById('filterStatus');
const btnRefreshList = document.getElementById('btnRefreshList');
const activeFilterNotice = document.getElementById('activeFilterNotice');
const currentFilterPublisherName = document.getElementById('currentFilterPublisherName');
const btnRemovePubFilter = document.getElementById('btnRemovePubFilter');
const pageRangeText = document.getElementById('pageRangeText');
const pageTotalText = document.getElementById('pageTotalText');
const currentPageText = document.getElementById('currentPageText');
const btnPrevPage = document.getElementById('btnPrevPage');
const btnNextPage = document.getElementById('btnNextPage');

// View 2: Publishers Table
const publisherTableBody = document.getElementById('publisherTableBody');
const btnClearPublisherFilter = document.getElementById('btnClearPublisherFilter');

// View 3: Batches
const batchesContainer = document.getElementById('batchesContainer');
const btnRefreshBatches = document.getElementById('btnRefreshBatches');

// Header Status
const pageConnectedBadge = document.getElementById('pageConnectedBadge');
const headerPageInfo = document.getElementById('headerPageInfo');

// Settings Modal Elements
const btnOpenSettingsModal = document.getElementById('btnOpenSettingsModal');
const settingsModal = document.getElementById('settingsModal');
const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
const btnCancelSettingsModal = document.getElementById('btnCancelSettingsModal');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const settingPageId = document.getElementById('settingPageId');
const settingAccessToken = document.getElementById('settingAccessToken');
const settingResultBox = document.getElementById('settingResultBox');
const saveSettingsSpinner = document.getElementById('saveSettingsSpinner');
const btnTestToken = document.getElementById('btnTestToken');
const testTokenSpinner = document.getElementById('testTokenSpinner');

// Test 1 Post Modal Elements
const btnOpenTestModal = document.getElementById('btnOpenTestModal');
const testPostModal = document.getElementById('testPostModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnRunTestPost = document.getElementById('btnRunTestPost');
const testPostUrl = document.getElementById('testPostUrl');
const testResultBox = document.getElementById('testResultBox');
const testSpinner = document.getElementById('testSpinner');

// Clear Data Modal Elements
const btnOpenClearModal = document.getElementById('btnOpenClearModal');
const clearDataModal = document.getElementById('clearDataModal');
const btnCloseClearModal = document.getElementById('btnCloseClearModal');
const btnCancelClearModal = document.getElementById('btnCancelClearModal');
const btnConfirmClearData = document.getElementById('btnConfirmClearData');
const clearDataSpinner = document.getElementById('clearDataSpinner');

// Post Detail Modal Elements
const postDetailModal = document.getElementById('postDetailModal');
const btnClosePostDetailModal = document.getElementById('btnClosePostDetailModal');
const btnDismissPostDetailModal = document.getElementById('btnDismissPostDetailModal');
const detailPostTime = document.getElementById('detailPostTime');
const detailPostType = document.getElementById('detailPostType');
const detailPostPublisher = document.getElementById('detailPostPublisher');
const detailPostStatus = document.getElementById('detailPostStatus');
const detailPostLikes = document.getElementById('detailPostLikes');
const detailPostComments = document.getElementById('detailPostComments');
const detailPostShares = document.getElementById('detailPostShares');
const detailPostMessage = document.getElementById('detailPostMessage');
const detailPostLink = document.getElementById('detailPostLink');
const detailPostId = document.getElementById('detailPostId');

// ==========================================================================
// TIỆN ÍCH CHUYỂN ĐỔI NGÀY THÁNG
// ==========================================================================

function dmyToYmd(dmyStr) {
  if (!dmyStr) return '';
  const match = dmyStr.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!match) return dmyStr;
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3];
  return `${year}-${month}-${day}`;
}

function ymdToDmy(ymdStr) {
  if (!ymdStr) return '';
  const match = ymdStr.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!match) return ymdStr;
  const year = match[1];
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  return `${day}/${month}/${year}`;
}

function dateToDmy(dateObj) {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
}

function dateToYmd(dateObj) {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${year}-${month}-${day}`;
}

function applyDateInputMask(inputEl) {
  inputEl.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 8) v = v.substring(0, 8);

    if (v.length >= 5) {
      e.target.value = `${v.substring(0, 2)}/${v.substring(2, 4)}/${v.substring(4)}`;
    } else if (v.length >= 3) {
      e.target.value = `${v.substring(0, 2)}/${v.substring(2)}`;
    } else {
      e.target.value = v;
    }
  });

  inputEl.addEventListener('change', () => {
    updateExportLinks();
    state.page = 1;
    fetchPosts();
    // Bỏ active preset khi user gõ tay
    document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
  });
}

function setupDatePickerSync(textInput, nativePicker, calendarBtn) {
  applyDateInputMask(textInput);

  calendarBtn.addEventListener('click', () => {
    const ymd = dmyToYmd(textInput.value.trim());
    if (ymd && ymd.length === 10) {
      nativePicker.value = ymd;
    }
    if (typeof nativePicker.showPicker === 'function') {
      try { nativePicker.showPicker(); } catch (e) { nativePicker.click(); }
    } else {
      nativePicker.click();
    }
  });

  nativePicker.addEventListener('change', () => {
    if (nativePicker.value) {
      textInput.value = ymdToDmy(nativePicker.value);
      updateExportLinks();
      state.page = 1;
      fetchPosts();
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
    }
  });

  textInput.addEventListener('blur', () => {
    const ymd = dmyToYmd(textInput.value.trim());
    if (ymd && ymd.length === 10) {
      nativePicker.value = ymd;
    }
  });
}

// ==========================================================================
// CHỌN NHANH MỐC THỜI GIAN (QUICK PRESETS)
// ==========================================================================
function setDatePreset(presetKey) {
  const now = new Date();
  let since = new Date();
  let until = new Date();

  switch (presetKey) {
    case 'today':
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      until = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;

    case 'yesterday':
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      until = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      break;

    case '7days':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      until = new Date();
      break;

    case '30days':
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      until = new Date();
      break;

    case 'thismonth':
      since = new Date(now.getFullYear(), now.getMonth(), 1);
      until = new Date();
      break;

    case 'all':
      // Để trống để quét toàn bộ bài viết trong DB
      sinceDateInput.value = '';
      untilDateInput.value = '';
      sinceDatePicker.value = '';
      untilDatePicker.value = '';
      state.since = '';
      state.until = '';
      highlightPreset('all');
      updateExportLinks();
      state.page = 1;
      fetchPosts();
      return;

    default:
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      until = new Date();
  }

  sinceDateInput.value = dateToDmy(since);
  untilDateInput.value = dateToDmy(until);
  sinceDatePicker.value = dateToYmd(since);
  untilDatePicker.value = dateToYmd(until);

  state.since = dateToYmd(since);
  state.until = dateToYmd(until);

  highlightPreset(presetKey);
  updateExportLinks();
  state.page = 1;
  fetchPosts();
}

function highlightPreset(presetKey) {
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === presetKey);
  });
}

document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    setDatePreset(btn.dataset.preset);
  });
});

function initDefaultDates() {
  setupDatePickerSync(sinceDateInput, sinceDatePicker, btnSinceCalendar);
  setupDatePickerSync(untilDateInput, untilDatePicker, btnUntilCalendar);

  // Mặc định chọn 30 ngày gần đây
  setDatePreset('30days');
}

// ==========================================================================
// ĐIỀU HƯỚNG TABS
// ==========================================================================
function switchTab(tabName) {
  state.currentTab = tabName;

  tabBtnPosts.classList.toggle('active', tabName === 'posts');
  tabBtnPublishers.classList.toggle('active', tabName === 'publishers');
  tabBtnBatches.classList.toggle('active', tabName === 'batches');

  viewPosts.style.display = tabName === 'posts' ? 'block' : 'none';
  viewPublishers.style.display = tabName === 'publishers' ? 'block' : 'none';
  viewBatches.style.display = tabName === 'batches' ? 'block' : 'none';

  if (tabName === 'posts') {
    fetchPosts();
  } else if (tabName === 'publishers') {
    fetchPublishers();
  } else if (tabName === 'batches') {
    fetchBatches();
  }
}

tabBtnPosts.addEventListener('click', () => switchTab('posts'));
tabBtnPublishers.addEventListener('click', () => switchTab('publishers'));
tabBtnBatches.addEventListener('click', () => switchTab('batches'));

if (btnGoToPublishersTab) {
  btnGoToPublishersTab.addEventListener('click', () => switchTab('publishers'));
}

// ==========================================================================
// CẬP NHẬT TRẠNG THÁI CẤU HÌNH & XUẤT FILE
// ==========================================================================
async function checkConfigStatus() {
  try {
    const res = await fetch('/api/config-status');
    const data = await res.json();
    const banners = document.getElementById('statusBanners');
    banners.innerHTML = '';

    state.configuredPageId = data.pageId;
    if (settingPageId) settingPageId.value = data.pageId || '';

    const settingConcurrency = document.getElementById('settingConcurrency');
    if (settingConcurrency && data.concurrency) {
      settingConcurrency.value = String(data.concurrency);
    }
    const headerConcurrencyBadge = document.getElementById('headerConcurrencyBadge');
    if (headerConcurrencyBadge && data.concurrency) {
      headerConcurrencyBadge.textContent = `⚡ Đa luồng: ${data.concurrency} luồng`;
      headerConcurrencyBadge.title = `Hệ thống đang chạy ${data.concurrency} luồng trình duyệt song song để xử lý siêu tốc`;
    }
    const settingSpeedMode = document.getElementById('settingSpeedMode');
    if (settingSpeedMode && data.delayMinMs) {
      if (data.delayMinMs <= 150) settingSpeedMode.value = 'turbo';
      else if (data.delayMinMs <= 500) settingSpeedMode.value = 'balanced';
      else settingSpeedMode.value = 'safe';
    }

    if (data.pageId) {
      pageConnectedBadge.style.display = 'inline-flex';
      headerPageInfo.textContent = `Fanpage ID: ${data.pageId}`;
    }

    if (!data.isApiConfigured) {
      banners.innerHTML += `
        <div class="banner banner-warning" style="padding: 0.85rem 1.25rem; border-radius: var(--radius-md); background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); color: #fcd34d; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>⚠️ <strong>Chưa cấu hình Fanpage hoặc Token:</strong> Vui lòng bấm <strong>"Cài đặt Fanpage & Token"</strong> để nhập ID và Access Token.</span>
        </div>
      `;
    }

    if (!data.isProfilePresent) {
      banners.innerHTML += `
        <div class="banner banner-info" style="padding: 0.85rem 1.25rem; border-radius: var(--radius-md); background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); color: #93c5fd; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>ℹ️ <strong>Chưa có phiên đăng nhập Facebook:</strong> Bạn có thể chạy lệnh <code>npm run login</code> trong terminal để lưu cookie tài khoản Facebook cho Playwright.</span>
        </div>
      `;
    }
  } catch (err) {
    console.error('Lỗi khi lấy config status:', err);
  }
}

function updateExportLinks() {
  const sinceVal = dmyToYmd(sinceDateInput.value.trim());
  const untilVal = dmyToYmd(untilDateInput.value.trim());

  const params = new URLSearchParams();
  if (sinceVal) params.set('since', sinceVal);
  if (untilVal) params.set('until', untilVal);
  if (state.batchId && state.batchId !== 'ALL') params.set('batchId', state.batchId);
  if (state.publisher) params.set('publisher', state.publisher);
  if (state.status !== 'ALL') params.set('status', state.status);
  if (state.postType && state.postType !== 'ALL') params.set('postType', state.postType);
  if (state.search) params.set('search', state.search);
  if (state.sortBy) params.set('sortBy', state.sortBy);
  if (state.sortOrder) params.set('sortOrder', state.sortOrder);

  const query = params.toString() ? `?${params.toString()}` : '';
  btnExportExcel.href = `/api/export.xlsx${query}`;
  btnExportCsv.href = `/api/export.csv${query}`;
}

// ==========================================================================
// STATS & METRICS DISPLAY (Hỗ trợ lọc động theo bộ lọc bảng)
// ==========================================================================

let cachedFullPublishers = [];

/**
 * Định dạng số nguyên hiển thị dấu chấm phân tách nghìn chuẩn Việt Nam
 */
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toLocaleString('vi-VN');
}

/**
 * Cập nhật banner thông báo đang xem thống kê theo bộ lọc
 */
function updateStatsFilterBanner(isFiltering) {
  const banner = document.getElementById('statsFilterBanner');
  const details = document.getElementById('filterBannerDetails');
  if (!banner || !details) return;

  if (!isFiltering) {
    banner.style.display = 'none';
    return;
  }

  const tags = [];
  if (state.search && state.search.trim()) tags.push(`Từ khóa: "${state.search.trim()}"`);
  if (state.postType && state.postType !== 'ALL') tags.push(`Loại: ${state.postType === 'SHARED' ? 'Chia sẻ' : 'Tự đăng'}`);
  if (state.status && state.status !== 'ALL') {
    const statusMap = { 'FOUND': 'Đã xác định', 'PENDING': 'Chờ quét', 'NOT_FOUND': 'Chưa nhận diện', 'ERROR': 'Lỗi' };
    tags.push(`Trạng thái: ${statusMap[state.status] || state.status}`);
  }
  if (state.publisher) tags.push(`Người đăng: ${state.publisher}`);
  if (state.batchId && state.batchId !== 'ALL') tags.push(`Đợt: ${state.batchId}`);
  if (state.since && state.until) tags.push(`Ngày: ${ymdToDmy(state.since)} → ${ymdToDmy(state.until)}`);

  details.textContent = tags.length > 0 ? tags.join(' • ') : 'Đang lọc';
  banner.style.display = 'flex';
}

async function fetchStats() {
  try {
    const params = new URLSearchParams();
    if (state.batchId && state.batchId !== 'ALL') params.set('batchId', state.batchId);
    if (state.since) params.set('since', state.since);
    if (state.until) params.set('until', state.until);
    if (state.publisher) params.set('publisher', state.publisher);
    if (state.status && state.status !== 'ALL') params.set('status', state.status);
    if (state.postType && state.postType !== 'ALL') params.set('postType', state.postType);
    if (state.search && state.search.trim()) params.set('search', state.search.trim());

    const isFiltering = Boolean(
      (state.batchId && state.batchId !== 'ALL') ||
      state.since ||
      state.until ||
      state.publisher ||
      (state.status && state.status !== 'ALL') ||
      (state.postType && state.postType !== 'ALL') ||
      (state.search && state.search.trim())
    );

    updateStatsFilterBanner(isFiltering);

    const queryString = params.toString();
    const url = queryString ? `/api/stats?${queryString}` : '/api/stats';
    const res = await fetch(url);
    const data = await res.json();

    const total = data.totalPosts || 0;
    const found = data.found || 0;
    const pending = data.pending || 0;
    const notFound = data.notFound || 0;
    const errors = data.errors || 0;
    const orig = data.originalPosts || 0;
    const shared = data.sharedPosts || 0;
    const likes = data.totalLikes || 0;
    const comments = data.totalComments || 0;
    const shares = data.totalShares || 0;
    const totalEng = data.totalEngagements !== undefined ? data.totalEngagements : (likes + comments + shares);
    const pubCount = data.publisherCount || (data.publishers ? data.publishers.length : 0);

    // Cập nhật thẻ 1: Tổng bài viết
    if (statTotalPosts) statTotalPosts.textContent = formatNumber(total);
    if (statOriginalPosts) statOriginalPosts.textContent = formatNumber(orig);
    if (statSharedPosts) statSharedPosts.textContent = formatNumber(shared);

    // Cập nhật thẻ 2: Đã xác định
    if (statFound) statFound.textContent = formatNumber(found);
    const foundPct = total > 0 ? Math.round((found / total) * 100) : 0;
    if (statFoundBar) statFoundBar.style.width = `${foundPct}%`;
    if (statFoundPercent) statFoundPercent.textContent = `${foundPct}% tổng số bài`;

    // Cập nhật thẻ 3: Chờ quét
    if (statPending) statPending.textContent = formatNumber(pending);

    // Cập nhật thẻ 4: Không công khai / Lỗi
    if (statNotFound) statNotFound.textContent = formatNumber(notFound);
    if (statErrors) statErrors.textContent = formatNumber(errors);

    // Cập nhật thẻ 5: Tương tác
    if (statTotalEngagements) statTotalEngagements.textContent = formatNumber(totalEng);
    if (statLikesCount) statLikesCount.textContent = formatNumber(likes);
    if (statCommentsCount) statCommentsCount.textContent = formatNumber(comments);
    if (statSharesCount) statSharesCount.textContent = formatNumber(shares);

    // Cập nhật thẻ 6: Số lượng quản trị viên
    if (statPublishersCount) statPublishersCount.textContent = formatNumber(pubCount);

    // Cập nhật badges trên Navigation Tabs
    if (tabPostsCount) tabPostsCount.textContent = formatNumber(total);
    if (tabPubsCount) tabPubsCount.textContent = formatNumber(pubCount);

    // Cập nhật dropdown lọc người đăng và bảng người đăng
    populatePublisherFilterDropdown(data.publishers || []);
    renderPublisherTable(data.publishers || []);
  } catch (err) {
    console.error('Lỗi khi tải số liệu thống kê:', err);
  }
}

// ==========================================================================
// VIEW 1: BẢNG DANH SÁCH BÀI VIẾT (POSTS TABLE)
// ==========================================================================

function populatePublisherFilterDropdown(publishers) {
  if (!filterPublisherSelect) return;
  // Lưu danh sách đầy đủ khi không lọc theo một publisher cụ thể
  if (!state.publisher && publishers && publishers.length > 0) {
    cachedFullPublishers = publishers;
  }
  const listToRender = (state.publisher && cachedFullPublishers.length > 0)
    ? cachedFullPublishers
    : (publishers && publishers.length > 0 ? publishers : cachedFullPublishers);

  const currentVal = state.publisher;
  filterPublisherSelect.innerHTML = '<option value="">Tất cả người đăng</option>';
  listToRender.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.publisher_name;
    opt.textContent = `${p.publisher_name} (${p.count})`;
    if (p.publisher_name === currentVal) opt.selected = true;
    filterPublisherSelect.appendChild(opt);
  });
}

function updateSortIndicators() {
  const indicatorCreated = document.getElementById('sortIndicator-created_time');
  if (indicatorCreated) {
    if (state.sortBy === 'created_time') {
      indicatorCreated.textContent = state.sortOrder === 'ASC' ? '▲' : '▼';
      indicatorCreated.style.opacity = '1';
    } else {
      indicatorCreated.textContent = '⬍';
      indicatorCreated.style.opacity = '0.35';
    }
  }

  document.querySelectorAll('.btn-sort-metric').forEach(btn => {
    if (btn.dataset.sort === state.sortBy) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

async function fetchPosts() {
  const sinceVal = dmyToYmd(sinceDateInput.value.trim());
  const untilVal = dmyToYmd(untilDateInput.value.trim());

  state.since = sinceVal;
  state.until = untilVal;
  updateExportLinks();

  // Đồng bộ số liệu thống kê 6 thẻ card theo bộ lọc hiện tại
  fetchStats();

  const params = new URLSearchParams({
    page: state.page,
    limit: state.limit
  });

  if (state.batchId && state.batchId !== 'ALL') params.set('batchId', state.batchId);
  if (state.since) params.set('since', state.since);
  if (state.until) params.set('until', state.until);
  if (state.publisher) params.set('publisher', state.publisher);
  if (state.status !== 'ALL') params.set('status', state.status);
  if (state.postType && state.postType !== 'ALL') params.set('postType', state.postType);
  if (state.search) params.set('search', state.search);
  if (state.sortBy) params.set('sortBy', state.sortBy);
  if (state.sortOrder) params.set('sortOrder', state.sortOrder);

  postsTableBody.innerHTML = `
    <tr>
      <td colspan="7" class="empty-cell">
        <div class="empty-state">
          <span class="spinner"></span>
          <span>Đang tải danh sách bài viết...</span>
        </div>
      </td>
    </tr>
  `;

  try {
    const res = await fetch(`/api/posts?${params.toString()}`);
    const data = await res.json();

    state.totalPages = data.totalPages || 1;
    state.currentPostsCache = data.items || [];
    renderPostsTable(data.items || []);
    renderPagination(data.total || 0);
  } catch (err) {
    postsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell text-danger">
          Lỗi khi tải bài viết: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}

function renderPostsTable(items) {
  postsTableBody.innerHTML = '';

  if (items.length === 0) {
    postsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">
          <div class="empty-state">
            <span class="empty-icon">📭</span>
            <h4>Không tìm thấy bài viết nào phù hợp</h4>
            <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">
              Hãy thử thay đổi khoảng ngày, xóa từ khóa tìm kiếm hoặc bấm "Lấy bài viết mới".
            </p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  items.forEach((p, index) => {
    const tr = document.createElement('tr');

    // Badge trạng thái bóc tách
    let statusBadge = '';
    if (p.publisher_status === 'FOUND') {
      statusBadge = `<span class="badge badge-success" title="Đã tìm thấy người đăng">✅ Đã xác định</span>`;
    } else if (p.publisher_status === 'PENDING') {
      statusBadge = `<span class="badge badge-warning" title="Đang chờ quét bằng Playwright">⏳ Chờ quét</span>`;
    } else if (p.publisher_status === 'NOT_FOUND') {
      statusBadge = `<span class="badge badge-secondary" title="Chưa nhận diện được tên tác giả">❓ Chưa rõ</span>`;
    } else {
      statusBadge = `<span class="badge badge-danger" title="Lỗi khi truy cập bài viết">❌ ${escapeHtml(p.publisher_status)}</span>`;
    }

    // Badge loại bài viết
    const isShared = p.post_type === 'SHARED';
    const postTypeBadge = isShared
      ? `<span class="badge badge-shared" title="Bài chia sẻ lại từ nguồn khác">🔄 Chia sẻ</span>`
      : `<span class="badge badge-original" title="Bài viết do Trang tự đăng tải">📝 Tự đăng</span>`;

    // Cột Người đăng (Quản trị viên)
    let publisherHtml = '<span class="text-dim">Chưa xác định</span>';
    if (p.publisher_status === 'FOUND' && p.publisher_name) {
      const initial = p.publisher_name.charAt(0).toUpperCase();
      const profileLink = p.publisher_profile_url
        ? `<a href="${escapeHtml(p.publisher_profile_url)}" target="_blank" class="publisher-link" title="Xem trang cá nhân">${escapeHtml(p.publisher_name)}</a>`
        : `<strong class="text-success">${escapeHtml(p.publisher_name)}</strong>`;

      publisherHtml = `
        <div class="publisher-cell">
          <span class="publisher-avatar">${initial}</span>
          ${profileLink}
        </div>
      `;
    }

    const formattedDate = formatVnDateDisplay(p.created_time);
    const messagePreview = p.message 
      ? `<span class="post-preview-text" style="cursor: pointer;" title="Bấm để xem toàn bộ nội dung">${escapeHtml(truncateText(p.message, 110))}</span>` 
      : '<em class="text-dim">Không có nội dung chữ (Hình ảnh / Video)</em>';

    const likesCount = p.likes_count || 0;
    const commentsCount = p.comments_count || 0;
    const sharesCount = p.shares_count || 0;

    const interactionsHtml = `
      <div class="interactions-cell">
        <span class="stat-pill pill-like" title="${likesCount.toLocaleString()} Lượt thích">❤️ ${likesCount.toLocaleString()}</span>
        <span class="stat-pill pill-comment" title="${commentsCount.toLocaleString()} Bình luận">💬 ${commentsCount.toLocaleString()}</span>
        <span class="stat-pill pill-share" title="${sharesCount.toLocaleString()} Chia sẻ">🔁 ${sharesCount.toLocaleString()}</span>
      </div>
    `;

    tr.innerHTML = `
      <td style="white-space: nowrap; font-size: 0.82rem; color: var(--text-muted); font-variant-numeric: tabular-nums;">
        ${formattedDate}
      </td>
      <td style="text-align: center;">${postTypeBadge}</td>
      <td>${publisherHtml}</td>
      <td class="cell-message-click">${messagePreview}</td>
      <td style="text-align: center; white-space: nowrap;">${interactionsHtml}</td>
      <td style="text-align: center;">${statusBadge}</td>
      <td style="text-align: center; white-space: nowrap;">
        <button type="button" class="btn btn-xs btn-outline btn-rescan-post" data-id="${escapeHtml(p.id)}" title="Quét lại tác giả bài viết này" style="margin-right: 2px;">
          🔄
        </button>
        <button type="button" class="btn btn-xs btn-outline btn-view-detail" title="Xem chi tiết nội dung bài viết">
          🔍
        </button>
        <a href="${escapeHtml(getCanonicalPostUrl(p))}" target="_blank" class="btn btn-xs btn-outline" title="Mở trực tiếp trên Facebook" style="margin-left: 2px;">
          ↗
        </a>
      </td>
    `;

    // Sự kiện quét lại bài viết đơn lẻ
    const btnRescan = tr.querySelector('.btn-rescan-post');
    if (btnRescan) {
      btnRescan.addEventListener('click', async (e) => {
        e.stopPropagation();
        btnRescan.disabled = true;
        btnRescan.innerHTML = '⏳';
        btnRescan.title = 'Đang quét lại...';
        showToast({ type: 'info', title: 'Đang quét lại...', message: 'Đang mở bài viết để tìm kiếm thông tin tác giả...' });
        try {
          const res = await fetch(`/api/posts/${encodeURIComponent(p.id)}/rescan`, { method: 'POST' });
          const data = await res.json();
          if (data.success && data.post) {
            if (data.post.publisher_name) {
              showToast({ type: 'success', title: 'Đã nhận diện!', message: `Tác giả: ${data.post.publisher_name}` });
            } else {
              showToast({ type: 'warning', title: 'Chưa phát hiện', message: 'Không tìm thấy tên người đăng trên trang bài viết.' });
            }
            fetchPosts();
            fetchStats();
            fetchPublishers();
          } else {
            showToast({ type: 'danger', title: 'Lỗi', message: data.error || 'Lỗi khi quét' });
          }
        } catch (err) {
          showToast({ type: 'danger', title: 'Lỗi', message: err.message });
        } finally {
          btnRescan.disabled = false;
          btnRescan.innerHTML = '🔄';
          btnRescan.title = 'Quét lại tác giả bài viết này';
        }
      });
    }

    // Sự kiện mở modal xem chi tiết
    const openDetail = () => openPostDetailModal(p);
    tr.querySelector('.btn-view-detail').addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail();
    });
    const msgCell = tr.querySelector('.cell-message-click');
    if (msgCell) msgCell.addEventListener('click', openDetail);

    postsTableBody.appendChild(tr);
  });
}

function renderPagination(total) {
  const start = total === 0 ? 0 : (state.page - 1) * state.limit + 1;
  const end = Math.min(state.page * state.limit, total);

  pageRangeText.textContent = `${start} - ${end}`;
  pageTotalText.textContent = total.toLocaleString();
  currentPageText.textContent = `Trang ${state.page} / ${state.totalPages}`;

  btnPrevPage.disabled = state.page <= 1;
  btnNextPage.disabled = state.page >= state.totalPages;
}

btnPrevPage.addEventListener('click', () => {
  if (state.page > 1) {
    state.page--;
    fetchPosts();
  }
});

btnNextPage.addEventListener('click', () => {
  if (state.page < state.totalPages) {
    state.page++;
    fetchPosts();
  }
});

// Tìm kiếm tức thì với Debounce
filterSearch.addEventListener('input', debounce(() => {
  state.search = filterSearch.value.trim();
  btnClearSearch.style.display = state.search ? 'inline-block' : 'none';
  state.page = 1;
  updateExportLinks();
  fetchPosts();
}, 350));

btnClearSearch.addEventListener('click', () => {
  filterSearch.value = '';
  state.search = '';
  btnClearSearch.style.display = 'none';
  state.page = 1;
  updateExportLinks();
  fetchPosts();
});

filterStatus.addEventListener('change', (e) => {
  state.status = e.target.value;
  state.page = 1;
  updateExportLinks();
  fetchPosts();
});

if (filterPostType) {
  filterPostType.addEventListener('change', (e) => {
    state.postType = e.target.value;
    state.page = 1;
    updateExportLinks();
    fetchPosts();
  });
}

if (filterPublisherSelect) {
  filterPublisherSelect.addEventListener('change', (e) => {
    state.publisher = e.target.value;
    state.page = 1;
    if (state.publisher) {
      activeFilterNotice.style.display = 'flex';
      currentFilterPublisherName.textContent = state.publisher;
      btnClearPublisherFilter.style.display = 'inline-block';
    } else {
      activeFilterNotice.style.display = 'none';
      btnClearPublisherFilter.style.display = 'none';
    }
    updateExportLinks();
    fetchPosts();
  });
}

// Sắp xếp cột Ngày đăng
const colSortCreated = document.querySelector('.col-sortable[data-sort="created_time"]');
if (colSortCreated) {
  colSortCreated.addEventListener('click', () => {
    if (state.sortBy === 'created_time') {
      state.sortOrder = state.sortOrder === 'DESC' ? 'ASC' : 'DESC';
    } else {
      state.sortBy = 'created_time';
      state.sortOrder = 'DESC';
    }
    updateSortIndicators();
    state.page = 1;
    updateExportLinks();
    fetchPosts();
  });
}

// Sắp xếp theo chỉ số tương tác (Likes, Comments, Shares)
document.querySelectorAll('.btn-sort-metric').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const targetSort = btn.dataset.sort;
    if (state.sortBy === targetSort) {
      state.sortOrder = state.sortOrder === 'DESC' ? 'ASC' : 'DESC';
    } else {
      state.sortBy = targetSort;
      state.sortOrder = 'DESC';
    }
    updateSortIndicators();
    state.page = 1;
    updateExportLinks();
    fetchPosts();
  });
});

btnRefreshList.addEventListener('click', () => {
  fetchPosts();
  fetchStats();
  showToast({ type: 'info', title: 'Đã làm mới', message: 'Dữ liệu bài viết đã được cập nhật.' });
});

// ==========================================================================
// VIEW 2: BẢNG XẾP HẠNG NGƯỜI ĐĂNG (PUBLISHERS TABLE)
// ==========================================================================

async function fetchPublishers() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    renderPublisherTable(data.publishers || []);
  } catch (err) {
    console.error('Lỗi khi tải danh sách người đăng:', err);
  }
}

function renderPublisherTable(publishers) {
  if (!publisherTableBody) return;
  publisherTableBody.innerHTML = '';

  if (publishers.length === 0) {
    publisherTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-cell">
          <div class="empty-state">
            <span class="empty-icon">👥</span>
            <h4>Chưa có dữ liệu người đăng bài</h4>
            <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">
              Hãy bấm <strong>"Tìm người đăng"</strong> ở trên để bóc tách tên quản trị viên.
            </p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  // Tính tổng số bài đã có người đăng để tính phần trăm
  const totalFoundPosts = publishers.reduce((acc, cur) => acc + cur.count, 0);
  const medals = ['🥇 #1', '🥈 #2', '🥉 #3'];

  publishers.forEach((p, idx) => {
    const isSelected = state.publisher === p.publisher_name;
    const rankBadge = idx < 3 ? `<strong style="color: #fbbf24;">${medals[idx]}</strong>` : `#${idx + 1}`;
    const pct = totalFoundPosts > 0 ? Math.round((p.count / totalFoundPosts) * 100) : 0;
    const initial = p.publisher_name.charAt(0).toUpperCase();

    const tr = document.createElement('tr');
    tr.className = isSelected ? 'row-selected' : '';
    tr.innerHTML = `
      <td style="text-align: center; font-size: 0.88rem;">${rankBadge}</td>
      <td>
        <div class="publisher-cell">
          <span class="publisher-avatar">${initial}</span>
          <strong style="color: #fff; font-size: 0.9rem;">${escapeHtml(p.publisher_name)}</strong>
        </div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <div style="flex: 1; height: 6px; background: #1e293b; border-radius: 999px; overflow: hidden;">
            <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); border-radius: 999px;"></div>
          </div>
          <span style="font-size: 0.75rem; color: var(--text-muted); width: 32px; text-align: right;">${pct}%</span>
        </div>
      </td>
      <td style="text-align: right;">
        <span class="badge badge-success" style="font-size: 0.85rem; font-weight: 700;">${p.count.toLocaleString()} bài</span>
      </td>
      <td style="text-align: center;">
        <button class="btn btn-xs ${isSelected ? 'btn-primary' : 'btn-outline'} btn-filter-pub">
          ${isSelected ? 'Đang chọn ✕' : 'Xem bài viết ➜'}
        </button>
      </td>
    `;

    tr.querySelector('.btn-filter-pub').addEventListener('click', () => {
      if (state.publisher === p.publisher_name) {
        clearPublisherFilter();
      } else {
        applyPublisherFilter(p.publisher_name);
        switchTab('posts');
      }
    });

    publisherTableBody.appendChild(tr);
  });
}

function applyPublisherFilter(name) {
  state.publisher = name;
  state.page = 1;
  activeFilterNotice.style.display = 'flex';
  currentFilterPublisherName.textContent = name;
  btnClearPublisherFilter.style.display = 'inline-block';
  if (filterPublisherSelect) filterPublisherSelect.value = name;
  updateExportLinks();
  fetchPosts();
}

function clearPublisherFilter() {
  state.publisher = '';
  state.page = 1;
  activeFilterNotice.style.display = 'none';
  btnClearPublisherFilter.style.display = 'none';
  if (filterPublisherSelect) filterPublisherSelect.value = '';
  updateExportLinks();
  fetchPosts();
  fetchStats();
}

function resetAllFilters() {
  state.search = '';
  state.batchId = 'ALL';
  state.publisher = '';
  state.status = 'ALL';
  state.postType = 'ALL';
  state.page = 1;

  if (filterSearch) filterSearch.value = '';
  if (btnClearSearch) btnClearSearch.style.display = 'none';
  if (filterBatchSelect) filterBatchSelect.value = 'ALL';
  if (filterStatus) filterStatus.value = 'ALL';
  if (filterPostType) filterPostType.value = 'ALL';
  if (filterPublisherSelect) filterPublisherSelect.value = '';
  if (activeFilterNotice) activeFilterNotice.style.display = 'none';
  if (btnClearPublisherFilter) btnClearPublisherFilter.style.display = 'none';

  updateExportLinks();
  fetchPosts();
  fetchStats();
}

btnRemovePubFilter.addEventListener('click', clearPublisherFilter);
btnClearPublisherFilter.addEventListener('click', clearPublisherFilter);

const btnResetFiltersBanner = document.getElementById('btnResetFiltersBanner');
if (btnResetFiltersBanner) {
  btnResetFiltersBanner.addEventListener('click', resetAllFilters);
}

// ==========================================================================
// VIEW 3: LỊCH SỬ CÁC ĐỢT ĐỒNG BỘ (BATCHES VIEW)
// ==========================================================================

async function fetchBatches() {
  try {
    const res = await fetch('/api/batches');
    const batches = await res.json();

    tabBatchesCount.textContent = (batches.length || 0).toLocaleString();

    // Cập nhật dropdown lọc đợt đồng bộ trên viewPosts
    const currentSelected = filterBatchSelect.value;
    filterBatchSelect.innerHTML = '<option value="ALL">Tất cả các đợt</option>';
    batches.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.batch_name} (${b.actual_posts_count || b.total_posts} bài)`;
      if (b.id === currentSelected) opt.selected = true;
      filterBatchSelect.appendChild(opt);
    });

    if (!batches || batches.length === 0) {
      batchesContainer.innerHTML = `
        <div class="empty-batches-card">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📭</div>
          <h3>Chưa có đợt đồng bộ nào</h3>
          <p style="margin-top: 0.4rem; color: var(--text-muted); font-size: 0.85rem;">
            Hãy chọn khoảng ngày bên trên và bấm <strong>"Lấy bài viết mới"</strong> hoặc <strong>"Đồng bộ toàn diện"</strong>.
          </p>
        </div>
      `;
      return;
    }

    batchesContainer.innerHTML = '';
    batches.forEach((b, idx) => {
      const isLatest = idx === 0;
      const total = b.actual_posts_count || b.total_posts || 0;
      const found = b.found_count || 0;
      const pending = b.pending_count || 0;
      const pct = total > 0 ? Math.round((found / total) * 100) : 0;

      const sinceStr = b.since_date ? ymdToDmy(b.since_date) : 'Toàn bộ';
      const untilStr = b.until_date ? ymdToDmy(b.until_date) : 'Nay';

      const card = document.createElement('div');
      card.className = `batch-card ${isLatest ? 'latest-batch' : ''}`;
      card.innerHTML = `
        <div class="batch-card-top">
          <div>
            <div class="batch-title">
              <span>🕒</span> ${escapeHtml(b.batch_name)}
            </div>
            <div class="batch-time">Đồng bộ lúc: ${escapeHtml(b.synced_at)}</div>
          </div>
          <div class="batch-range-badge" title="Khoảng thời gian quét">
            🗓️ ${sinceStr} ➜ ${untilStr}
          </div>
        </div>

        <div class="batch-stats-chips">
          <div class="batch-stat-box">
            <span class="batch-stat-val" style="color: #60a5fa;">${total.toLocaleString()}</span>
            <span class="batch-stat-lbl">Tổng bài</span>
          </div>
          <div class="batch-stat-box">
            <span class="batch-stat-val text-success">${found.toLocaleString()}</span>
            <span class="batch-stat-lbl">Tìm thấy (${pct}%)</span>
          </div>
          <div class="batch-stat-box">
            <span class="batch-stat-val text-amber">${pending.toLocaleString()}</span>
            <span class="batch-stat-lbl">Chờ quét</span>
          </div>
        </div>

        <div class="batch-interactions-row">
          <span>❤️ <strong>${(b.total_likes || 0).toLocaleString()}</strong> thích</span>
          <span>💬 <strong>${(b.total_comments || 0).toLocaleString()}</strong> bình luận</span>
          <span>🔁 <strong>${(b.total_shares || 0).toLocaleString()}</strong> chia sẻ</span>
        </div>

        <div class="batch-card-actions">
          <button class="btn btn-sm btn-primary btn-view-batch" data-batch-id="${escapeHtml(b.id)}">
            👁️ Xem ${total.toLocaleString()} bài viết
          </button>
          <a href="/api/export.xlsx?batchId=${escapeHtml(b.id)}" class="btn btn-sm btn-export-excel" download>
            📊 Xuất Excel
          </a>
        </div>
      `;

      card.querySelector('.btn-view-batch').addEventListener('click', () => {
        state.batchId = b.id;
        filterBatchSelect.value = b.id;
        switchTab('posts');
      });

      batchesContainer.appendChild(card);
    });
  } catch (err) {
    batchesContainer.innerHTML = `<div class="empty-batches-card" style="color: var(--danger);">Lỗi tải đợt đồng bộ: ${escapeHtml(err.message)}</div>`;
  }
}

btnRefreshBatches.addEventListener('click', () => {
  fetchBatches();
  showToast({ type: 'info', title: 'Đã làm mới', message: 'Danh sách các đợt đồng bộ đã được cập nhật.' });
});

filterBatchSelect.addEventListener('change', (e) => {
  state.batchId = e.target.value;
  state.page = 1;
  updateExportLinks();
  fetchPosts();
});

// ==========================================================================
// MODAL CHI TIẾT BÀI VIẾT (POST DETAIL MODAL)
// ==========================================================================

function openPostDetailModal(post) {
  if (!postDetailModal) return;

  const formattedDate = formatVnDateDisplay(post.created_time);
  detailPostTime.textContent = formattedDate || '-';
  detailPostType.innerHTML = post.post_type === 'SHARED'
    ? `<span class="badge badge-shared">🔄 Bài chia sẻ</span>`
    : `<span class="badge badge-original">📝 Bài tự đăng</span>`;

  if (post.publisher_status === 'FOUND' && post.publisher_name) {
    detailPostPublisher.textContent = post.publisher_name;
    detailPostPublisher.className = 'meta-val font-semibold text-success';
  } else {
    detailPostPublisher.textContent = 'Chưa xác định';
    detailPostPublisher.className = 'meta-val text-dim';
  }

  let statusText = 'Chưa quét';
  let statusClass = 'badge badge-warning';
  if (post.publisher_status === 'FOUND') {
    statusText = 'Đã xác định';
    statusClass = 'badge badge-success';
  } else if (post.publisher_status === 'NOT_FOUND') {
    statusText = 'Chưa nhận diện';
    statusClass = 'badge badge-secondary';
  } else if (post.publisher_status === 'ERROR') {
    statusText = 'Lỗi tải trang';
    statusClass = 'badge badge-danger';
  }
  detailPostStatus.innerHTML = `<span class="${statusClass}">${statusText}</span>`;

  detailPostLikes.textContent = (post.likes_count || 0).toLocaleString();
  detailPostComments.textContent = (post.comments_count || 0).toLocaleString();
  detailPostShares.textContent = (post.shares_count || 0).toLocaleString();

  detailPostMessage.textContent = post.message || 'Bài viết này không có nội dung chữ (chỉ chứa hình ảnh, video hoặc liên kết).';
  detailPostLink.href = getCanonicalPostUrl(post) || '#';
  detailPostId.textContent = `Mã bài viết (FB ID): ${post.id}`;

  postDetailModal.style.display = 'flex';
}

function closePostDetailModal() {
  if (postDetailModal) postDetailModal.style.display = 'none';
}

if (btnClosePostDetailModal) btnClosePostDetailModal.addEventListener('click', closePostDetailModal);
if (btnDismissPostDetailModal) btnDismissPostDetailModal.addEventListener('click', closePostDetailModal);
if (postDetailModal) {
  postDetailModal.addEventListener('click', (e) => {
    if (e.target === postDetailModal) closePostDetailModal();
  });
}

// ==========================================================================
// CÁC HÀNH ĐỘNG ĐỒNG BỘ DỮ LIỆU (ACTIONS)
// ==========================================================================

// 1. Đồng bộ bài viết qua Graph API
btnSyncPosts.addEventListener('click', async () => {
  const sinceVal = sinceDateInput.value.trim();
  const untilVal = untilDateInput.value.trim();

  if (!sinceVal || !untilVal) {
    showToast({ type: 'warning', title: 'Thiếu mốc thời gian', message: 'Vui lòng chọn từ ngày và đến ngày (dd/mm/yyyy).' });
    return;
  }

  btnSyncPosts.disabled = true;
  btnSyncPosts.innerHTML = '<span class="spinner-sm"></span> Đang đồng bộ...';

  try {
    const res = await fetch('/api/sync-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since: sinceVal, until: untilVal })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const errMsg = data.error || '';
      const isTokenExpired = errMsg.includes('190') || errMsg.toLowerCase().includes('expired') || errMsg.includes('Token Facebook') || errMsg.includes('OAuthException');
      if (isTokenExpired) {
        showToast({
          type: 'error',
          title: 'Token Facebook hết hạn',
          message: 'Vui lòng cập nhật lại Facebook Access Token trong phần Cài đặt.',
          duration: 6000
        });
        openSettingsModal();
      } else {
        showToast({ type: 'error', title: 'Lỗi đồng bộ bài viết', message: errMsg || 'Không thể lấy bài viết từ Facebook' });
      }
    } else {
      showToast({ type: 'success', title: 'Đã lấy xong bài viết', message: 'Hệ thống đang tự động nhận diện người đăng bài...' });
      fetchStats();
      fetchBatches();
      fetchPosts();
      // Tự động chạy ngay tiến trình tìm người đăng bài bằng Playwright
      setTimeout(() => {
        if (!jobState.isRunning) {
          btnDetectPublishers.click();
        }
      }, 600);
    }
  } catch (err) {
    showToast({ type: 'error', title: 'Lỗi mạng', message: err.message });
  } finally {
    btnSyncPosts.disabled = false;
    btnSyncPosts.innerHTML = `
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
      <span>Lấy bài viết mới</span>
    `;
  }
});

// 2. Tìm người đăng bài qua Playwright
btnDetectPublishers.addEventListener('click', async () => {
  const force = forceRecheckCheckbox.checked;
  const sinceVal = sinceDateInput.value.trim();
  const untilVal = untilDateInput.value.trim();

  try {
    const res = await fetch('/api/detect-publishers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        force,
        since: sinceVal || undefined,
        until: untilVal || undefined
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      showToast({ type: 'error', title: 'Không thể khởi chạy', message: data.error || 'Lỗi khi bắt đầu tìm người đăng' });
    } else {
      showToast({ type: 'info', title: 'Bắt đầu quét', message: 'Trình duyệt đang khởi động để nhận diện người đăng.' });
      startJobPolling();
    }
  } catch (err) {
    showToast({ type: 'error', title: 'Lỗi kết nối', message: err.message });
  }
});

// 3. Đồng bộ toàn diện (Tự động lấy bài + Tìm người đăng)
btnSyncAll.addEventListener('click', async () => {
  const sinceVal = sinceDateInput.value.trim();
  const untilVal = untilDateInput.value.trim();

  if (!sinceVal || !untilVal) {
    showToast({ type: 'warning', title: 'Thiếu mốc thời gian', message: 'Vui lòng chọn từ ngày và đến ngày (dd/mm/yyyy).' });
    return;
  }

  const force = forceRecheckCheckbox.checked;

  btnSyncAll.disabled = true;
  btnSyncAll.innerHTML = '<span class="spinner-sm"></span> <span>Đang chuẩn bị...</span>';

  try {
    const res = await fetch('/api/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since: sinceVal, until: untilVal, force })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      showToast({ type: 'error', title: 'Lỗi khởi chạy', message: data.error || 'Không thể bắt đầu quy trình toàn diện' });
    } else {
      showToast({ type: 'success', title: 'Đang tiến hành', message: data.message });
      fetchStats();
      fetchBatches();
      startJobPolling();
    }
  } catch (err) {
    showToast({ type: 'error', title: 'Lỗi kết nối', message: err.message });
  } finally {
    btnSyncAll.disabled = false;
    btnSyncAll.innerHTML = `
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
      <div class="btn-text-block">
        <span class="btn-text-main">⚡ Đồng bộ toàn diện</span>
        <span class="btn-text-sub">Lấy bài viết + Tìm người đăng</span>
      </div>
    `;
  }
});

// ==========================================================================
// QUẢN LÝ TIẾN TRÌNH QUÉT NỀN (WORKER POLLING)
// ==========================================================================

function startJobPolling() {
  if (state.pollingInterval) return;
  state.isJobRunning = true;
  progressSection.style.display = 'block';

  const progChip = document.getElementById('progConcurrencyChip');
  if (progChip) {
    const c = document.getElementById('settingConcurrency')?.value || '10';
    progChip.textContent = `⚡ Đa luồng: ${c} luồng`;
  }

  state.pollingInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const status = await res.json();

      if (status.isRunning) {
        const total = status.total || 0;
        const current = status.processed !== undefined ? status.processed : (status.current || 0);
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;

        progressBarFill.style.width = `${pct}%`;
        progressCountText.textContent = `${current} / ${total} bài (${pct}%)`;
        progressCurrentMsg.textContent = status.currentPostMessage ? truncateText(status.currentPostMessage, 60) : (status.currentPostUrl ? truncateText(status.currentPostUrl, 60) : '-');
        progressCurrentPub.textContent = status.currentPublisher || status.lastPublisher || '-';

        progFound.textContent = (status.found || 0).toLocaleString();
        progNotFound.textContent = (status.notFound || 0).toLocaleString();
        progErrors.textContent = (status.errors || 0).toLocaleString();
      } else {
        stopJobPolling();
        progressSection.style.display = 'none';
        showToast({
          type: 'success',
          title: 'Hoàn tất quét bài viết',
          message: 'Trình duyệt đã hoàn thành trích xuất dữ liệu người đăng.'
        });
        fetchStats();
        fetchBatches();
        fetchPosts();
      }
    } catch (e) {
      console.warn('Lỗi polling status:', e);
    }
  }, 1500);
}

function stopJobPolling() {
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }
  state.isJobRunning = false;
}

btnStopJob.addEventListener('click', async () => {
  try {
    await fetch('/api/stop-job', { method: 'POST' });
    btnStopJob.textContent = 'Đang dừng...';
    showToast({ type: 'warning', title: 'Yêu cầu dừng', message: 'Đã gửi tín hiệu dừng tiến trình quét.' });
  } catch (e) {}
});

// ==========================================================================
// MODAL CÀI ĐẶT FANPAGE & TOKEN
// ==========================================================================

function openSettingsModal() {
  settingsModal.style.display = 'flex';
  settingResultBox.style.display = 'none';
  settingResultBox.innerHTML = '';
  if (state.configuredPageId && !settingPageId.value) {
    settingPageId.value = state.configuredPageId;
  }
  settingAccessToken.focus();
}

function closeSettingsModal() {
  settingsModal.style.display = 'none';
}

btnOpenSettingsModal.addEventListener('click', openSettingsModal);
btnCloseSettingsModal.addEventListener('click', closeSettingsModal);
btnCancelSettingsModal.addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});

btnSaveSettings.addEventListener('click', async () => {
  const pageId = settingPageId.value.trim();
  const token = settingAccessToken.value.trim();

  if (!pageId) {
    showToast({ type: 'warning', title: 'Thiếu thông tin', message: 'Vui lòng nhập ID Fanpage.' });
    settingPageId.focus();
    return;
  }

  if (!token) {
    showToast({ type: 'warning', title: 'Thiếu thông tin', message: 'Vui lòng dán Facebook Access Token.' });
    settingAccessToken.focus();
    return;
  }

  btnSaveSettings.disabled = true;
  saveSettingsSpinner.style.display = 'inline-block';
  settingResultBox.style.display = 'block';
  settingResultBox.innerHTML = '<em class="text-muted">Đang kiểm tra và liên kết với Facebook...</em>';

  try {
    const concurrency = document.getElementById('settingConcurrency')?.value || 10;
    const speedMode = document.getElementById('settingSpeedMode')?.value || 'turbo';
    let delayMinMs = 50;
    let delayMaxMs = 150;
    if (speedMode === 'balanced') {
      delayMinMs = 200;
      delayMaxMs = 500;
    } else if (speedMode === 'safe') {
      delayMinMs = 1000;
      delayMaxMs = 2500;
    }

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, accessToken: token, concurrency, delayMinMs, delayMaxMs })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      settingResultBox.innerHTML = `<div style="color: var(--danger); font-weight: 600;">❌ ${escapeHtml(data.error || 'Lỗi lưu cấu hình')}</div>`;
    } else {
      settingResultBox.innerHTML = `
        <div style="color: var(--success); font-weight: 700; font-size: 0.95rem;">✅ ${escapeHtml(data.message)}</div>
        <div style="margin-top: 0.4rem; color: var(--text-muted); font-size: 0.82rem;">
          Đã lưu vào tệp tin <code>.env</code>. Cấu hình này sẽ được duy trì vĩnh viễn trên máy chủ.
        </div>
      `;
      showToast({ type: 'success', title: 'Lưu cấu hình thành công', message: 'Đã kết nối Fanpage và lưu vào .env' });
      checkConfigStatus();
    }
  } catch (err) {
    settingResultBox.innerHTML = `<div style="color: var(--danger);">❌ Lỗi kết nối: ${escapeHtml(err.message)}</div>`;
  } finally {
    btnSaveSettings.disabled = false;
    saveSettingsSpinner.style.display = 'none';
  }
});

if (btnTestToken) {
  btnTestToken.addEventListener('click', async () => {
    const token = settingAccessToken.value.trim();
    const pageId = settingPageId.value.trim();

    if (!token) {
      showToast({ type: 'warning', title: 'Thiếu mã Token', message: 'Vui lòng dán Facebook Access Token vào ô trên trước khi kiểm tra.' });
      settingAccessToken.focus();
      return;
    }

    btnTestToken.disabled = true;
    if (testTokenSpinner) testTokenSpinner.style.display = 'inline-block';
    settingResultBox.style.display = 'block';
    settingResultBox.innerHTML = '<div style="color: var(--text-muted);"><span class="spinner-sm" style="display:inline-block;margin-right:6px;"></span>Đang gửi yêu cầu xác thực quyền hạn đến máy chủ Meta Graph API...</div>';

    try {
      const res = await fetch('/api/test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, pageId })
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        settingResultBox.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); border-radius: 8px; padding: 12px; margin-top: 8px;">
            <div style="color: var(--danger); font-weight: 700; font-size: 0.95rem;">❌ Kiểm tra thất bại!</div>
            <div style="color: var(--text-primary); margin-top: 4px; font-size: 0.88rem;">${escapeHtml(data.error || 'Token không hợp lệ hoặc đã hết hạn.')}</div>
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 6px;">👉 Hãy tạo mã mới trên Graph API Explorer theo hướng dẫn trong README.md.</div>
          </div>
        `;
        return;
      }

      if (data.pageId && !settingPageId.value) {
        settingPageId.value = data.pageId;
      }

      const scopesHtml = (data.scopeStatus || []).map(s => {
        const icon = s.granted ? '✅' : (s.critical ? '❌' : '⚠️');
        const color = s.granted ? 'var(--success)' : (s.critical ? 'var(--danger)' : 'var(--warning)');
        const extraNote = s.critical && !s.granted ? ' <strong style="color: var(--danger);">(BẮT BUỘC ĐỂ ĐỌC LIKES/COMMENTS)</strong>' : '';
        return `<div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.08); font-size: 0.83rem;">
          <span style="font-family: monospace; color: ${color}; font-weight: 600;">${icon} ${escapeHtml(s.name)}</span>
          <span style="color: var(--text-muted); text-align: right;">${escapeHtml(s.desc)}${extraNote}</span>
        </div>`;
      }).join('');

      const boxBorder = data.hasPagesReadUserContent && data.isPageToken ? 'var(--success)' : 'var(--warning)';
      const bgBox = data.hasPagesReadUserContent && data.isPageToken ? 'rgba(34, 197, 94, 0.08)' : 'rgba(234, 179, 8, 0.08)';

      settingResultBox.innerHTML = `
        <div style="background: ${bgBox}; border: 1px solid ${boxBorder}; border-radius: 8px; padding: 12px; margin-top: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="color: ${data.isPageToken ? 'var(--success)' : 'var(--warning)'}; font-size: 0.95rem;">
              ${data.isPageToken ? '📄 Page Access Token' : '👤 User Access Token'}
            </strong>
            <span class="badge" style="font-size: 0.75rem;">Hạn dùng: ${escapeHtml(data.expiresAt)}</span>
          </div>

          <div style="font-size: 0.86rem; margin-bottom: 6px;">
            <strong>Trang liên kết:</strong> <span style="color: var(--accent-color);">${escapeHtml(data.pageName)}</span> (ID: <code>${escapeHtml(data.pageId)}</code>)
          </div>

          <div style="margin: 8px 0; background: rgba(0,0,0,0.25); border-radius: 6px; padding: 8px;">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; text-transform: uppercase;">Trạng thái 4 quyền cốt lõi:</div>
            ${scopesHtml}
          </div>

          <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 600;">
            ${escapeHtml(data.recommendation)}
          </div>
        </div>
      `;

      if (data.hasPagesReadUserContent && data.isPageToken) {
        showToast({ type: 'success', title: 'Token hoàn hảo!', message: 'Token đầy đủ quyền hạn đọc Likes, Comments, Shares' });
      } else if (!data.hasPagesReadUserContent) {
        showToast({ type: 'warning', title: 'Thiếu quyền đọc Like/Comment', message: 'Cần thêm quyền pages_read_user_content trên Meta Graph Explorer' });
      }
    } catch (err) {
      settingResultBox.innerHTML = `<div style="color: var(--danger);">❌ Lỗi kết nối: ${escapeHtml(err.message)}</div>`;
    } finally {
      btnTestToken.disabled = false;
      if (testTokenSpinner) testTokenSpinner.style.display = 'none';
    }
  });
}


// ==========================================================================
// MODAL KIỂM TRA RIÊNG 1 BÀI VIẾT (TEST POST)
// ==========================================================================

btnOpenTestModal.addEventListener('click', () => {
  testPostModal.style.display = 'flex';
  testResultBox.style.display = 'none';
  testResultBox.innerHTML = '';
  testPostUrl.focus();
});

function closeTestModal() {
  testPostModal.style.display = 'none';
}

btnCloseModal.addEventListener('click', closeTestModal);
btnCancelModal.addEventListener('click', closeTestModal);
testPostModal.addEventListener('click', (e) => {
  if (e.target === testPostModal) closeTestModal();
});

btnRunTestPost.addEventListener('click', async () => {
  const url = testPostUrl.value.trim();
  if (!url) {
    showToast({ type: 'warning', title: 'Thiếu liên kết', message: 'Vui lòng dán URL bài viết Facebook cần kiểm tra.' });
    return;
  }

  btnRunTestPost.disabled = true;
  testSpinner.style.display = 'inline-block';
  testResultBox.style.display = 'block';
  testResultBox.innerHTML = '<em class="text-muted">Đang mở Chromium và kiểm tra bài viết... Vui lòng chờ trong giây lát.</em>';

  try {
    const res = await fetch('/api/test-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (data.status === 'FOUND') {
      testResultBox.innerHTML = `
        <div style="color: var(--success); font-weight: 700; margin-bottom: 0.5rem;">✅ Trích xuất thành công người đăng!</div>
        <div style="line-height: 1.8;">
          <div><strong>Người đăng:</strong> <span class="text-success font-bold">${escapeHtml(data.name)}</span></div>
          <div><strong>Mã định danh (UID):</strong> <code>${data.id || 'N/A'}</code></div>
          <div><strong>Trang cá nhân:</strong> ${data.profileUrl ? `<a href="${data.profileUrl}" target="_blank" class="publisher-link">${data.profileUrl}</a>` : 'N/A'}</div>
          <div><strong>Phương thức phát hiện:</strong> <code>${data.method}</code></div>
          <div><strong>Đoạn văn bản trích xuất:</strong> <em>"${escapeHtml(data.rawText || '')}"</em></div>
        </div>
      `;
      showToast({ type: 'success', title: 'Thành công', message: `Đã tìm thấy: ${data.name}` });
    } else {
      testResultBox.innerHTML = `
        <div style="color: var(--warning); font-weight: 700; margin-bottom: 0.5rem;">⚠️ Trạng thái: ${data.status}</div>
        <div><strong>Lý do:</strong> ${escapeHtml(data.reason || 'Không tìm thấy thông tin người đăng')}</div>
        ${data.debugPath ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">Thư mục gỡ lỗi: <code>${escapeHtml(data.debugPath)}</code></div>` : ''}
      `;
      showToast({ type: 'warning', title: 'Không tìm thấy', message: data.reason || 'Không tìm thấy thông tin người đăng' });
    }
  } catch (err) {
    testResultBox.innerHTML = `<div style="color: var(--danger);">❌ Lỗi khi kiểm tra: ${err.message}</div>`;
    showToast({ type: 'error', title: 'Lỗi', message: err.message });
  } finally {
    btnRunTestPost.disabled = false;
    testSpinner.style.display = 'none';
  }
});

// ==========================================================================
// CÁC HÀM TIỆN ÍCH CHUNG
// ==========================================================================

function getCanonicalPostUrl(post) {
  if (!post) return '';
  const id = typeof post === 'object' ? (post.id || '') : post;
  const pageId = typeof post === 'object' ? (post.page_id || '') : '';
  if (id.includes('_')) {
    const parts = id.split('_');
    const pid = pageId || parts[0];
    const storyFbid = parts[1];
    if (pid && storyFbid) {
      return `https://www.facebook.com/permalink.php?story_fbid=${storyFbid}&id=${pid}`;
    }
  }
  if (typeof post === 'object' && post.permalink_url) return post.permalink_url;
  return typeof post === 'string' ? post : '';
}

function formatVnDateDisplay(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch (e) {
    return isoString;
  }
}

function truncateText(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// MODAL XÁC NHẬN XÓA SẠCH DỮ LIỆU (CLEAR DATA MODAL)
// ==========================================================================
function openClearModal() {
  if (clearDataModal) clearDataModal.style.display = 'flex';
}

function closeClearModal() {
  if (clearDataModal) clearDataModal.style.display = 'none';
}

if (btnOpenClearModal) btnOpenClearModal.addEventListener('click', openClearModal);
if (btnCloseClearModal) btnCloseClearModal.addEventListener('click', closeClearModal);
if (btnCancelClearModal) btnCancelClearModal.addEventListener('click', closeClearModal);
if (clearDataModal) {
  clearDataModal.addEventListener('click', (e) => {
    if (e.target === clearDataModal) closeClearModal();
  });
}

if (btnConfirmClearData) {
  btnConfirmClearData.addEventListener('click', async () => {
    btnConfirmClearData.disabled = true;
    if (clearDataSpinner) clearDataSpinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/clear-data', { method: 'POST' });
      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.ok ? text : `Máy chủ phản hồi HTTP ${res.status}: Vui lòng khởi động lại server`);
      }

      if (res.ok && data.success) {
        showToast({
          type: 'success',
          title: 'Đã xóa dữ liệu thành công',
          message: data.message || 'Toàn bộ bài viết và đợt đồng bộ đã được làm sạch.'
        });
        closeClearModal();
        fetchStats();
        fetchBatches();
        fetchPosts();
      } else {
        showToast({
          type: 'error',
          title: 'Lỗi xóa dữ liệu',
          message: data.error || 'Không thể xóa dữ liệu trên hệ thống'
        });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Lỗi kết nối', message: err.message });
    } finally {
      btnConfirmClearData.disabled = false;
      if (clearDataSpinner) clearDataSpinner.style.display = 'none';
    }
  });
}

// ==========================================================================
// KHỞI CHẠY ỨNG DỤNG (INITIALIZATION)
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  initDefaultDates();
  checkConfigStatus();
  updateSortIndicators();
  fetchStats();
  fetchPosts();
  fetchBatches();

  // Kiểm tra nếu có job đang chạy ngầm từ trước
  fetch('/api/status').then(r => r.json()).then(j => {
    if (j.isRunning) startJobPolling();
  }).catch(() => {});
});
