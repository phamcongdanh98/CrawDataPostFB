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
  minLikes: '',
  selectedPostIds: new Set(),
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
const filterDateRangeSelect = document.getElementById('filterDateRangeSelect');
const filterCustomDateWrap = document.getElementById('filterCustomDateWrap');
const filterSinceDate = document.getElementById('filterSinceDate');
const filterUntilDate = document.getElementById('filterUntilDate');
const btnApplyCustomDate = document.getElementById('btnApplyCustomDate');
const filterBatchSelect = document.getElementById('filterBatchSelect');
const filterPostType = document.getElementById('filterPostType');
const filterPublisherSelect = document.getElementById('filterPublisherSelect');
const filterSearch = document.getElementById('filterSearch');
const btnClearSearch = document.getElementById('btnClearSearch');
const filterStatus = document.getElementById('filterStatus');
const filterMinLikes = document.getElementById('filterMinLikes');
const filterSortBy = document.getElementById('filterSortBy');
const btnExportExcelFiltered = document.getElementById('btnExportExcelFiltered');
const btnExportExcelFilteredText = document.getElementById('btnExportExcelFilteredText');
const activeFilterChipsBar = document.getElementById('activeFilterChipsBar');
const activeFilterChipsList = document.getElementById('activeFilterChipsList');
const btnClearAllActiveFilters = document.getElementById('btnClearAllActiveFilters');
const selectAllPosts = document.getElementById('selectAllPosts');
const batchActionBar = document.getElementById('batchActionBar');
const selectedPostsCount = document.getElementById('selectedPostsCount');
const btnBatchRescanSelected = document.getElementById('btnBatchRescanSelected');
const btnBatchRescanNotFound = document.getElementById('btnBatchRescanNotFound');
const btnClearSelectedPosts = document.getElementById('btnClearSelectedPosts');
const btnCopySummaryReport = document.getElementById('btnCopySummaryReport');
const btnRefreshLeaderboard = document.getElementById('btnRefreshLeaderboard');
const btnCopyPostLink = document.getElementById('btnCopyPostLink');
const btnCopyPostText = document.getElementById('btnCopyPostText');
const btnRescanFromModal = document.getElementById('btnRescanFromModal');
const rescanModalSpinner = document.getElementById('rescanModalSpinner');
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
  if (filterDateRangeSelect && presetKey) {
    filterDateRangeSelect.value = presetKey;
  }
  if (filterCustomDateWrap) {
    filterCustomDateWrap.style.display = presetKey === 'custom' ? 'flex' : 'none';
  }
}

document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    setDatePreset(btn.dataset.preset);
  });
});

if (filterDateRangeSelect) {
  filterDateRangeSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      if (filterCustomDateWrap) filterCustomDateWrap.style.display = 'flex';
      if (filterSinceDate) filterSinceDate.focus();
    } else {
      if (filterCustomDateWrap) filterCustomDateWrap.style.display = 'none';
      setDatePreset(val);
    }
  });
}

if (btnApplyCustomDate) {
  btnApplyCustomDate.addEventListener('click', () => {
    const s = filterSinceDate ? filterSinceDate.value.trim() : '';
    const u = filterUntilDate ? filterUntilDate.value.trim() : '';
    if (!s && !u) {
      showToast({ type: 'warning', message: 'Vui lòng nhập ngày bắt đầu hoặc kết thúc.' });
      return;
    }
    if (sinceDateInput && s) sinceDateInput.value = s;
    if (untilDateInput && u) untilDateInput.value = u;
    if (sinceDatePicker && s) sinceDatePicker.value = dmyToYmd(s);
    if (untilDatePicker && u) untilDatePicker.value = dmyToYmd(u);
    state.since = s ? dmyToYmd(s) : '';
    state.until = u ? dmyToYmd(u) : '';
    state.page = 1;
    document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
    updateExportLinks();
    fetchPosts();
    fetchCharts();
    showToast({ type: 'info', title: 'Đã lọc theo ngày tùy chọn', message: `${s || '...'} ➔ ${u || '...'}` });
  });
}

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
      if (data.delayMinMs <= 50) settingSpeedMode.value = 'warp';
      else if (data.delayMinMs <= 150) settingSpeedMode.value = 'turbo';
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
  const sinceVal = sinceDateInput ? dmyToYmd(sinceDateInput.value.trim()) : '';
  const untilVal = untilDateInput ? dmyToYmd(untilDateInput.value.trim()) : '';

  const params = new URLSearchParams();
  if (sinceVal) params.set('since', sinceVal);
  if (untilVal) params.set('until', untilVal);
  if (state.batchId && state.batchId !== 'ALL') params.set('batchId', state.batchId);
  if (state.publisher) params.set('publisher', state.publisher);
  if (state.status !== 'ALL') params.set('status', state.status);
  if (state.postType && state.postType !== 'ALL') params.set('postType', state.postType);
  if (state.search) params.set('search', state.search);
  if (state.minLikes) params.set('minLikes', state.minLikes);
  if (state.sortBy) params.set('sortBy', state.sortBy);
  if (state.sortOrder) params.set('sortOrder', state.sortOrder);

  const query = params.toString() ? `?${params.toString()}` : '';
  if (btnExportExcel) btnExportExcel.href = `/api/export.xlsx${query}`;
  if (btnExportCsv) btnExportCsv.href = `/api/export.csv${query}`;

  const btnExportExcelFiltered = document.getElementById('btnExportExcelFiltered');
  if (btnExportExcelFiltered) btnExportExcelFiltered.href = `/api/export.xlsx${query}`;

  // Cập nhật giá trị đồng bộ cho ô ngày ở Toolbar nếu có
  const filterSinceDate = document.getElementById('filterSinceDate');
  const filterUntilDate = document.getElementById('filterUntilDate');
  if (filterSinceDate && sinceDateInput) filterSinceDate.value = sinceDateInput.value;
  if (filterUntilDate && untilDateInput) filterUntilDate.value = untilDateInput.value;

  renderActiveFilterChips();
}

/**
 * Lọc nhanh theo Tác giả / Quản trị viên (hỗ trợ click từ biểu đồ hoặc bảng)
 */
function filterByPublisher(pubName) {
  if (!pubName) return;
  const isSame = state.publisher === pubName;
  state.publisher = isSame ? '' : pubName;

  if (filterPublisherSelect) {
    filterPublisherSelect.value = state.publisher;
  }

  if (activeFilterNotice && currentFilterPublisherName && btnClearPublisherFilter) {
    if (state.publisher) {
      activeFilterNotice.style.display = 'flex';
      currentFilterPublisherName.textContent = state.publisher;
      btnClearPublisherFilter.style.display = 'inline-block';
    } else {
      activeFilterNotice.style.display = 'none';
      btnClearPublisherFilter.style.display = 'none';
    }
  }

  state.page = 1;
  updateExportLinks();
  fetchPosts();
  fetchCharts();

  // Cuộn mượt màn hình xuống danh sách bài viết
  const viewPosts = document.getElementById('viewPosts');
  if (viewPosts) {
    viewPosts.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast({
    type: 'info',
    title: state.publisher ? 'Đã lọc theo tác giả' : 'Đã bỏ lọc tác giả',
    message: state.publisher ? `Hiển thị các bài viết do "${state.publisher}" đăng.` : 'Hiển thị bài viết của tất cả người đăng.'
  });
}

/**
 * Lọc nhanh theo Loại bài viết (Bài tự đăng / Bài chia sẻ)
 */
function filterByPostType(type) {
  if (!type) return;
  const isSame = state.postType === type;
  state.postType = isSame ? 'ALL' : type;

  if (filterPostType) {
    filterPostType.value = state.postType;
  }

  state.page = 1;
  updateExportLinks();
  fetchPosts();
  fetchCharts();

  const viewPosts = document.getElementById('viewPosts');
  if (viewPosts) {
    viewPosts.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const label = state.postType === 'ORIGINAL' ? 'Bài tự đăng' : (state.postType === 'SHARED' ? 'Bài chia sẻ' : 'Tất cả loại bài');
  showToast({
    type: 'info',
    title: 'Lọc loại bài viết',
    message: `Đang lọc: ${label}`
  });
}

/**
 * Lọc theo khoảng ngày (khi click vào điểm biểu đồ xu hướng ngày)
 */
function filterByDate(sinceYmd, untilYmd, label = '') {
  if (!sinceYmd || !untilYmd) return;
  if (sinceDateInput) sinceDateInput.value = ymdToDmy(sinceYmd);
  if (untilDateInput) untilDateInput.value = ymdToDmy(untilYmd);
  if (sinceDatePicker) sinceDatePicker.value = sinceYmd;
  if (untilDatePicker) untilDatePicker.value = untilYmd;

  state.since = sinceYmd;
  state.until = untilYmd;
  state.page = 1;

  document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));

  updateExportLinks();
  fetchPosts();
  fetchCharts();

  const viewPosts = document.getElementById('viewPosts');
  if (viewPosts) {
    viewPosts.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast({
    type: 'info',
    title: 'Lọc theo ngày',
    message: label || `Từ ${ymdToDmy(sinceYmd)} đến ${ymdToDmy(untilYmd)}`
  });
}

/**
 * Hiển thị thanh Chip các bộ lọc đang kích hoạt
 */
function renderActiveFilterChips() {
  const container = document.getElementById('activeFilterChipsBar');
  const list = document.getElementById('activeFilterChipsList');
  if (!container || !list) return;

  const chips = [];

  // 1. Khoảng ngày
  const sinceVal = state.since || (sinceDateInput ? dmyToYmd(sinceDateInput.value.trim()) : '');
  const untilVal = state.until || (untilDateInput ? dmyToYmd(untilDateInput.value.trim()) : '');
  if (sinceVal && untilVal) {
    chips.push({
      key: 'date',
      icon: '📅',
      label: `${ymdToDmy(sinceVal)} ➔ ${ymdToDmy(untilVal)}`,
      clear: () => setDatePreset('all')
    });
  } else if (sinceVal) {
    chips.push({
      key: 'date',
      icon: '📅',
      label: `Từ ${ymdToDmy(sinceVal)}`,
      clear: () => setDatePreset('all')
    });
  } else if (untilVal) {
    chips.push({
      key: 'date',
      icon: '📅',
      label: `Đến ${ymdToDmy(untilVal)}`,
      clear: () => setDatePreset('all')
    });
  }

  // 2. Người đăng
  if (state.publisher) {
    chips.push({
      key: 'publisher',
      icon: '👤',
      label: `Quản trị viên: ${state.publisher}`,
      clear: () => {
        state.publisher = '';
        if (filterPublisherSelect) filterPublisherSelect.value = '';
        if (activeFilterNotice) activeFilterNotice.style.display = 'none';
        if (btnClearPublisherFilter) btnClearPublisherFilter.style.display = 'none';
        state.page = 1;
        updateExportLinks();
        fetchPosts();
        fetchCharts();
      }
    });
  }

  // 3. Loại bài viết
  if (state.postType && state.postType !== 'ALL') {
    chips.push({
      key: 'postType',
      icon: '📑',
      label: state.postType === 'ORIGINAL' ? 'Bài tự đăng' : 'Bài chia sẻ',
      clear: () => {
        state.postType = 'ALL';
        if (filterPostType) filterPostType.value = 'ALL';
        state.page = 1;
        updateExportLinks();
        fetchPosts();
        fetchCharts();
      }
    });
  }

  // 4. Đợt đồng bộ
  if (state.batchId && state.batchId !== 'ALL') {
    chips.push({
      key: 'batchId',
      icon: '🕒',
      label: `Đợt: ${state.batchId}`,
      clear: () => {
        state.batchId = 'ALL';
        if (filterBatchSelect) filterBatchSelect.value = 'ALL';
        state.page = 1;
        updateExportLinks();
        fetchPosts();
        fetchCharts();
      }
    });
  }

  // 5. Trạng thái
  if (state.status && state.status !== 'ALL') {
    const statusLabels = { FOUND: 'Đã xác định', PENDING: 'Chờ quét', NOT_FOUND: 'Chưa rõ', ERROR: 'Lỗi' };
    chips.push({
      key: 'status',
      icon: '⚙️',
      label: statusLabels[state.status] || state.status,
      clear: () => {
        state.status = 'ALL';
        if (filterStatus) filterStatus.value = 'ALL';
        state.page = 1;
        updateExportLinks();
        fetchPosts();
      }
    });
  }

  // 6. Like tối thiểu
  if (state.minLikes && Number(state.minLikes) > 0) {
    chips.push({
      key: 'minLikes',
      icon: '❤️',
      label: `>= ${state.minLikes} likes`,
      clear: () => {
        state.minLikes = '';
        if (filterMinLikes) filterMinLikes.value = '';
        state.page = 1;
        updateExportLinks();
        fetchPosts();
      }
    });
  }

  // 7. Từ khóa tìm kiếm
  if (state.search && state.search.trim()) {
    chips.push({
      key: 'search',
      icon: '🔍',
      label: `"${state.search.trim()}"`,
      clear: () => {
        state.search = '';
        if (filterSearch) filterSearch.value = '';
        if (btnClearSearch) btnClearSearch.style.display = 'none';
        state.page = 1;
        updateExportLinks();
        fetchPosts();
      }
    });
  }

  if (chips.length === 0) {
    container.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  list.innerHTML = '';

  chips.forEach(c => {
    const span = document.createElement('span');
    span.className = 'filter-chip';
    span.innerHTML = `
      <span>${c.icon}</span>
      <span>${escapeHtml(c.label)}</span>
      <span class="filter-chip-remove" title="Xóa bộ lọc này">✕</span>
    `;
    span.querySelector('.filter-chip-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      c.clear();
    });
    list.appendChild(span);
  });
}

if (btnClearAllActiveFilters) {
  btnClearAllActiveFilters.addEventListener('click', () => {
    state.publisher = '';
    if (filterPublisherSelect) filterPublisherSelect.value = '';
    state.postType = 'ALL';
    if (filterPostType) filterPostType.value = 'ALL';
    state.batchId = 'ALL';
    if (filterBatchSelect) filterBatchSelect.value = 'ALL';
    state.status = 'ALL';
    if (filterStatus) filterStatus.value = 'ALL';
    state.minLikes = '';
    if (filterMinLikes) filterMinLikes.value = '';
    state.search = '';
    if (filterSearch) filterSearch.value = '';
    if (btnClearSearch) btnClearSearch.style.display = 'none';
    if (activeFilterNotice) activeFilterNotice.style.display = 'none';
    if (btnClearPublisherFilter) btnClearPublisherFilter.style.display = 'none';
    if (filterCustomDateWrap) filterCustomDateWrap.style.display = 'none';

    setDatePreset('all');
    state.page = 1;
    updateExportLinks();
    fetchPosts();
    fetchCharts();
    fetchPublishers();
    showToast({ type: 'success', title: 'Đã xóa tất cả bộ lọc', message: 'Hiển thị toàn bộ dữ liệu bài viết.' });
  });
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
  if (state.minLikes) tags.push(`Min Like: ≥ ${state.minLikes}`);
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
    if (state.minLikes) params.set('minLikes', state.minLikes);

    const isFiltering = Boolean(
      (state.batchId && state.batchId !== 'ALL') ||
      state.since ||
      state.until ||
      state.publisher ||
      state.minLikes ||
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

    // Tự động vẽ lại các biểu đồ trực quan theo bộ lọc
    if (typeof fetchChartData === 'function') {
      fetchChartData();
    }
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
  if (state.minLikes) params.set('minLikes', state.minLikes);
  if (state.sortBy) params.set('sortBy', state.sortBy);
  if (state.sortOrder) params.set('sortOrder', state.sortOrder);

  postsTableBody.innerHTML = `
    <tr>
      <td colspan="8" class="empty-cell">
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

    const totalCount = data.total || 0;
    if (btnExportExcelFilteredText) {
      btnExportExcelFilteredText.textContent = `Xuất Excel (${totalCount.toLocaleString()} bài)`;
    }
  } catch (err) {
    postsTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell text-danger">
          Lỗi khi tải bài viết: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}

function updateBatchActionBar() {
  if (!batchActionBar) return;
  const count = state.selectedPostIds.size;
  if (count > 0) {
    batchActionBar.style.display = 'flex';
    if (selectedPostsCount) selectedPostsCount.textContent = count.toLocaleString();
  } else {
    batchActionBar.style.display = 'none';
  }

  if (selectAllPosts && state.currentPostsCache && state.currentPostsCache.length > 0) {
    const allChecked = state.currentPostsCache.every(p => state.selectedPostIds.has(p.id));
    const someChecked = state.currentPostsCache.some(p => state.selectedPostIds.has(p.id));
    selectAllPosts.checked = allChecked;
    selectAllPosts.indeterminate = someChecked && !allChecked;
  }
}

function renderPostsTable(items) {
  postsTableBody.innerHTML = '';

  if (items.length === 0) {
    postsTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">
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
    updateBatchActionBar();
    return;
  }

  items.forEach((p) => {
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

    // Badge loại bài viết (hỗ trợ click để lọc)
    const isShared = p.post_type === 'SHARED';
    const postTypeBadge = isShared
      ? `<span class="badge badge-shared clickable-type" data-type="SHARED" title="Bấm để lọc bài chia sẻ" style="cursor: pointer;">🔄 Chia sẻ</span>`
      : `<span class="badge badge-original clickable-type" data-type="ORIGINAL" title="Bấm để lọc bài tự đăng" style="cursor: pointer;">📝 Tự đăng</span>`;

    // Cột Người đăng (Quản trị viên) - hỗ trợ click để lọc
    let publisherHtml = '<span class="text-dim">Chưa xác định</span>';
    if (p.publisher_status === 'FOUND' && p.publisher_name) {
      const initial = p.publisher_name.charAt(0).toUpperCase();
      const profileLink = p.publisher_profile_url
        ? `<a href="${escapeHtml(p.publisher_profile_url)}" target="_blank" class="publisher-link" title="Xem trang cá nhân" onclick="event.stopPropagation()">${escapeHtml(p.publisher_name)}</a>`
        : `<strong class="text-success">${escapeHtml(p.publisher_name)}</strong>`;

      publisherHtml = `
        <div class="publisher-cell clickable-publisher" data-publisher="${escapeHtml(p.publisher_name)}" title="Bấm để lọc theo quản trị viên: ${escapeHtml(p.publisher_name)}" style="cursor: pointer;">
          <span class="publisher-avatar">${initial}</span>
          ${profileLink}
          <span style="font-size: 0.72rem; color: #38bdf8; margin-left: 2px;" title="Lọc theo tác giả này">🔍</span>
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

    const isChecked = state.selectedPostIds.has(p.id);

    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="post-checkbox" data-id="${escapeHtml(p.id)}" ${isChecked ? 'checked' : ''}>
      </td>
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

    // Sự kiện checkbox chọn bài
    const chk = tr.querySelector('.post-checkbox');
    if (chk) {
      chk.addEventListener('change', () => {
        if (chk.checked) {
          state.selectedPostIds.add(p.id);
        } else {
          state.selectedPostIds.delete(p.id);
        }
        updateBatchActionBar();
      });
    }

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

  updateBatchActionBar();
}

if (postsTableBody) {
  postsTableBody.addEventListener('click', (e) => {
    const pubEl = e.target.closest('.clickable-publisher');
    if (pubEl && !e.target.closest('a')) {
      const pubName = pubEl.dataset.publisher;
      if (pubName) {
        filterByPublisher(pubName);
        return;
      }
    }

    const typeEl = e.target.closest('.clickable-type');
    if (typeEl) {
      const type = typeEl.dataset.type;
      if (type) {
        filterByPostType(type);
        return;
      }
    }
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

if (filterMinLikes) {
  filterMinLikes.addEventListener('input', debounce((e) => {
    state.minLikes = e.target.value.trim();
    state.page = 1;
    updateExportLinks();
    fetchPosts();
  }, 350));
}

if (filterSortBy) {
  filterSortBy.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    state.page = 1;
    updateSortIndicators();
    updateExportLinks();
    fetchPosts();
  });
}

// Checkbox chọn tất cả bài viết trên trang
if (selectAllPosts) {
  selectAllPosts.addEventListener('change', () => {
    const isChecked = selectAllPosts.checked;
    (state.currentPostsCache || []).forEach(p => {
      if (isChecked) {
        state.selectedPostIds.add(p.id);
      } else {
        state.selectedPostIds.delete(p.id);
      }
    });
    document.querySelectorAll('.post-checkbox').forEach(cb => {
      cb.checked = isChecked;
    });
    updateBatchActionBar();
  });
}

// Nút Quét lại bài đã chọn
if (btnBatchRescanSelected) {
  btnBatchRescanSelected.addEventListener('click', async () => {
    const postIds = Array.from(state.selectedPostIds);
    if (postIds.length === 0) {
      showToast({ type: 'warning', title: 'Chưa chọn bài viết', message: 'Vui lòng tích chọn ít nhất 1 bài viết.' });
      return;
    }
    btnBatchRescanSelected.disabled = true;
    const spinner = document.getElementById('batchRescanSpinner');
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/posts/batch-rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postIds })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast({ type: 'danger', title: 'Lỗi', message: data.error || 'Không thể quét lại' });
      } else {
        showToast({ type: 'success', title: 'Đã bắt đầu', message: data.message });
        startPollingJobState();
      }
    } catch (err) {
      showToast({ type: 'danger', title: 'Lỗi kết nối', message: err.message });
    } finally {
      btnBatchRescanSelected.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  });
}

// Nút Quét lại tất cả bài NOT_FOUND
if (btnBatchRescanNotFound) {
  btnBatchRescanNotFound.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/detect-publishers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false, includeNotFound: true })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast({ type: 'danger', title: 'Lỗi', message: data.error || 'Không thể bắt đầu' });
      } else {
        showToast({ type: 'success', title: 'Đã bắt đầu', message: 'Đang quét lại tất cả các bài chưa nhận diện được người đăng...' });
        startPollingJobState();
      }
    } catch (err) {
      showToast({ type: 'danger', title: 'Lỗi kết nối', message: err.message });
    }
  });
}

// Nút Bỏ chọn tất cả
if (btnClearSelectedPosts) {
  btnClearSelectedPosts.addEventListener('click', () => {
    state.selectedPostIds.clear();
    document.querySelectorAll('.post-checkbox').forEach(cb => { cb.checked = false; });
    updateBatchActionBar();
  });
}

// Nút Sao chép báo cáo tóm tắt KPI (Clipboard Summary)
if (btnCopySummaryReport) {
  btnCopySummaryReport.addEventListener('click', async () => {
    try {
      btnCopySummaryReport.disabled = true;
      btnCopySummaryReport.textContent = '⏳ Đang tổng hợp...';

      const [statsRes, lbRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/publisher-leaderboard')
      ]);
      const stats = await statsRes.json();
      const leaderboard = await lbRes.json();

      const sinceStr = sinceDateInput.value.trim() || 'Toàn thời gian';
      const untilStr = untilDateInput.value.trim() || '';
      const dateRangeStr = untilStr ? `${sinceStr} - ${untilStr}` : sinceStr;

      let report = `📊 BÁO CÁO HIỆU SUẤT FANPAGE FACEBOOK\n`;
      report += `⏱️ Thời gian: ${dateRangeStr}\n`;
      report += `📝 Tổng số bài viết: ${(stats.totalPosts || 0).toLocaleString()} bài (Tự đăng: ${(stats.originalPosts || 0).toLocaleString()} | Chia sẻ: ${(stats.sharedPosts || 0).toLocaleString()})\n`;
      report += `✅ Đã nhận diện tác giả: ${(stats.found || 0).toLocaleString()} bài\n`;
      report += `❤️ Lượt Thích: ${(stats.totalLikes || 0).toLocaleString()}\n`;
      report += `💬 Bình luận: ${(stats.totalComments || 0).toLocaleString()}\n`;
      report += `🔁 Chia sẻ: ${(stats.totalShares || 0).toLocaleString()}\n`;
      report += `⭐ TỔNG TƯƠNG TÁC: ${(stats.totalEngagements || 0).toLocaleString()}\n\n`;

      report += `🏆 BẢNG XẾP HẠNG QUẢN TRỊ VIÊN / NGƯỜI ĐĂNG:\n`;
      if (Array.isArray(leaderboard) && leaderboard.length > 0) {
        leaderboard.slice(0, 10).forEach((pub, idx) => {
          const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`));
          report += `${medal} ${pub.publisher_name}: ${pub.post_count} bài | ⭐ ${pub.total_engagements.toLocaleString()} tương tác (TB: ${pub.avg_engagement}/bài)\n`;
        });
      } else {
        report += `(Chưa có dữ liệu người đăng)\n`;
      }

      report += `\n📅 Xuất lúc: ${new Date().toLocaleString('vi-VN')} qua Fanpage Publisher Tool`;

      await navigator.clipboard.writeText(report);
      showToast({ type: 'success', title: 'Đã sao chép báo cáo!', message: 'Nội dung tóm tắt KPI đã lưu vào bộ nhớ tạm (sẵn sàng dán vào Zalo/Telegram).' });
    } catch (err) {
      showToast({ type: 'danger', title: 'Lỗi', message: 'Không thể sao chép: ' + err.message });
    } finally {
      btnCopySummaryReport.disabled = false;
      btnCopySummaryReport.textContent = '📋 Báo cáo nhanh';
    }
  });
}

// Nút làm mới Leaderboard
if (btnRefreshLeaderboard) {
  btnRefreshLeaderboard.addEventListener('click', () => {
    fetchPublishers();
    showToast({ type: 'info', title: 'Đã làm mới', message: 'Bảng xếp hạng Người đăng đã được cập nhật.' });
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
// VIEW 2: BẢNG XẾP HẠNG NGƯỜI ĐĂNG (PUBLISHERS LEADERBOARD)
// ==========================================================================

async function fetchPublishers() {
  try {
    const res = await fetch('/api/publisher-leaderboard');
    const data = await res.json();
    renderPublisherTable(Array.isArray(data) ? data : []);
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
        <td colspan="9" class="empty-cell">
          <div class="empty-state">
            <span class="empty-icon">👥</span>
            <h4>Chưa có dữ liệu bảng xếp hạng người đăng</h4>
            <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">
              Hãy bấm <strong>"Tìm người đăng"</strong> ở trên để bóc tách tên quản trị viên.
            </p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  publishers.forEach((p, idx) => {
    const isSelected = state.publisher === p.publisher_name;
    const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
    const initial = p.publisher_name.charAt(0).toUpperCase();

    const tr = document.createElement('tr');
    const postCount = p.post_count !== undefined ? p.post_count : (p.count || 0);
    const origCount = p.original_count || 0;
    const sharedCount = p.shared_count || 0;

    tr.className = isSelected ? 'row-selected' : '';
    tr.innerHTML = `
      <td style="text-align: center;">
        <span class="rank-badge ${rankClass}">${idx + 1}</span>
      </td>
      <td>
        <div class="publisher-cell">
          <span class="publisher-avatar">${initial}</span>
          <div>
            <strong style="color: #fff; font-size: 0.9rem;">${escapeHtml(p.publisher_name)}</strong>
            <div style="font-size: 0.76rem; color: var(--text-dim); margin-top: 2px;">
              📝 ${origCount} tự đăng • 🔄 ${sharedCount} chia sẻ
            </div>
          </div>
        </div>
      </td>
      <td style="text-align: center;">
        <span class="badge badge-success" style="font-size: 0.82rem; font-weight: 700;">${postCount.toLocaleString()} bài</span>
      </td>
      <td style="text-align: center; color: #f87171; font-weight: 600;">${(p.total_likes || 0).toLocaleString()}</td>
      <td style="text-align: center; color: #60a5fa; font-weight: 600;">${(p.total_comments || 0).toLocaleString()}</td>
      <td style="text-align: center; color: #34d399; font-weight: 600;">${(p.total_shares || 0).toLocaleString()}</td>
      <td style="text-align: center;">
        <span class="engagement-pill">⭐ ${(p.total_engagements || 0).toLocaleString()}</span>
      </td>
      <td style="text-align: center;">
        <span class="avg-pill">${p.avg_engagement || 0}</span>
      </td>
      <td style="text-align: center;">
        <button class="btn btn-xs ${isSelected ? 'btn-primary' : 'btn-outline'} btn-filter-pub">
          ${isSelected ? 'Đang chọn ✕' : 'Lọc bài ➜'}
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

let currentModalPost = null;

function openPostDetailModal(post) {
  if (!postDetailModal) return;
  currentModalPost = post;

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

if (btnCopyPostLink) {
  btnCopyPostLink.addEventListener('click', async () => {
    if (!currentModalPost) return;
    const url = getCanonicalPostUrl(currentModalPost);
    if (!url) {
      showToast({ type: 'warning', message: 'Không có đường dẫn cho bài viết này' });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast({ type: 'success', title: 'Đã sao chép link', message: 'Đường dẫn bài viết đã được lưu vào clipboard.' });
    } catch (e) {
      prompt('Sao chép đường dẫn bài viết:', url);
    }
  });
}

if (btnCopyPostText) {
  btnCopyPostText.addEventListener('click', async () => {
    if (!currentModalPost) return;
    const text = currentModalPost.message || '';
    if (!text) {
      showToast({ type: 'info', message: 'Bài viết không có nội dung chữ.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast({ type: 'success', title: 'Đã sao chép nội dung', message: 'Nội dung bài viết đã được lưu vào clipboard.' });
    } catch (e) {
      prompt('Sao chép nội dung bài viết:', text);
    }
  });
}

if (btnRescanFromModal) {
  btnRescanFromModal.addEventListener('click', async () => {
    if (!currentModalPost || !currentModalPost.id) return;
    btnRescanFromModal.disabled = true;
    if (rescanModalSpinner) rescanModalSpinner.style.display = 'inline-block';

    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(currentModalPost.id)}/rescan`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast({ type: 'error', title: 'Lỗi quét bài', message: data.error || 'Không thể quét lại bài viết' });
      } else {
        showToast({
          type: data.status === 'FOUND' ? 'success' : (data.status === 'NOT_FOUND' ? 'warning' : 'error'),
          title: data.status === 'FOUND' ? 'Nhận diện thành công!' : 'Kết quả quét',
          message: data.name ? `Người đăng: ${data.name}` : (data.reason || `Trạng thái: ${data.status}`)
        });

        // Cập nhật lại đối tượng modal hiện tại
        currentModalPost.publisher_status = data.status;
        currentModalPost.publisher_name = data.name || null;
        openPostDetailModal(currentModalPost);

        // Cập nhật lại danh sách và thống kê
        fetchPosts();
        fetchStats();
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Lỗi kết nối', message: err.message });
    } finally {
      btnRescanFromModal.disabled = false;
      if (rescanModalSpinner) rescanModalSpinner.style.display = 'none';
    }
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
    if (speedMode === 'warp') {
      delayMinMs = 10;
      delayMaxMs = 50;
    } else if (speedMode === 'balanced') {
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
// VISUAL CHARTS DASHBOARD (CHART.JS MODULE)
// ==========================================================================

let trendChartInstance = null;
let typeChartInstance = null;
let publisherChartInstance = null;

const btnToggleCharts = document.getElementById('btnToggleCharts');
const chartsToggleText = document.getElementById('chartsToggleText');
const chartsContainer = document.getElementById('chartsContainer');

if (btnToggleCharts && chartsContainer) {
  btnToggleCharts.addEventListener('click', () => {
    const isHidden = chartsContainer.style.display === 'none';
    if (isHidden) {
      chartsContainer.style.display = 'grid';
      if (chartsToggleText) chartsToggleText.textContent = '🔼 Thu gọn';
    } else {
      chartsContainer.style.display = 'none';
      if (chartsToggleText) chartsToggleText.textContent = '🔽 Mở rộng';
    }
  });
}

/**
 * Tải dữ liệu và vẽ lại cả 3 biểu đồ trực quan
 */
async function fetchChartData() {
  const trendCanvas = document.getElementById('trendChart');
  if (!trendCanvas || typeof Chart === 'undefined') return;

  try {
    const params = new URLSearchParams();
    if (state.batchId && state.batchId !== 'ALL') params.set('batchId', state.batchId);
    if (state.since) params.set('since', state.since);
    if (state.until) params.set('until', state.until);
    if (state.publisher) params.set('publisher', state.publisher);
    if (state.status && state.status !== 'ALL') params.set('status', state.status);
    if (state.postType && state.postType !== 'ALL') params.set('postType', state.postType);
    if (state.search && state.search.trim()) params.set('search', state.search.trim());
    if (state.minLikes) params.set('minLikes', state.minLikes);

    const queryString = params.toString();
    const url = queryString ? `/api/chart-data?${queryString}` : '/api/chart-data';
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) return;

    renderTrendChart(data.trends || []);
    renderTypeChart(data.postTypes || []);
    renderPublisherChart(data.topPublishers || []);

    const periodEl = document.getElementById('chartTrendPeriod');
    if (periodEl) {
      if (data.trends && data.trends.length > 0) {
        periodEl.textContent = `${data.trends.length} ngày ghi nhận`;
      } else {
        periodEl.textContent = 'Chưa có số liệu';
      }
    }
  } catch (err) {
    console.warn('[Chart] Lỗi cập nhật dữ liệu biểu đồ:', err);
  }
}

/**
 * Biểu đồ 1: Đường xu hướng tương tác theo ngày (Line / Smooth Area)
 */
function renderTrendChart(trends = []) {
  const canvas = document.getElementById('trendChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (trendChartInstance) {
    trendChartInstance.destroy();
    trendChartInstance = null;
  }

  const labels = trends.map(t => {
    // Format YYYY-MM-DD sang DD/MM
    const parts = (t.date || '').split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : t.date;
  });
  const likesData = trends.map(t => t.likes || 0);
  const commentsData = trends.map(t => t.comments || 0);
  const sharesData = trends.map(t => t.shares || 0);

  const ctx = canvas.getContext('2d');
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '❤️ Thích',
          data: likesData,
          borderColor: '#f43f5e',
          backgroundColor: 'rgba(244, 63, 94, 0.1)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#f43f5e'
        },
        {
          label: '💬 Bình luận',
          data: commentsData,
          borderColor: '#38bdf8',
          backgroundColor: 'transparent',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#38bdf8'
        },
        {
          label: '🔁 Chia sẻ',
          data: sharesData,
          borderColor: '#34d399',
          backgroundColor: 'transparent',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#34d399'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          const item = trends[index];
          if (item && item.date) {
            filterByDate(item.date, item.date, `Ngày ${formatVnDateDisplay(item.date)}`);
          }
        }
      },
      onHover: (event, elements) => {
        const canvas = event.chart ? event.chart.canvas : (event.native ? event.native.target : null);
        if (canvas) canvas.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#cbd5e1',
            boxWidth: 12,
            font: { family: 'Inter', size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          callbacks: {
            footer: function () {
              return '👉 Bấm vào điểm ngày để lọc danh sách bài viết';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
        }
      }
    }
  });
}

/**
 * Biểu đồ 2: Tỷ lệ phân bố loại bài viết (Doughnut Chart)
 */
function renderTypeChart(postTypes = []) {
  const canvas = document.getElementById('typeChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (typeChartInstance) {
    typeChartInstance.destroy();
    typeChartInstance = null;
  }

  let origCount = 0;
  let sharedCount = 0;
  postTypes.forEach(p => {
    if (p.post_type === 'SHARED') sharedCount += p.count;
    else origCount += p.count;
  });

  const total = origCount + sharedCount;
  const labels = ['Bài tự đăng', 'Bài chia sẻ'];
  const dataValues = [origCount, sharedCount];

  const ctx = canvas.getContext('2d');
  typeChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: total > 0 ? dataValues : [1],
          backgroundColor: total > 0 ? ['#3b82f6', '#a855f7'] : ['rgba(148, 163, 184, 0.2)'],
          borderColor: 'rgba(15, 23, 42, 0.8)',
          borderWidth: 3,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          const clickedType = index === 0 ? 'ORIGINAL' : 'SHARED';
          filterByPostType(clickedType);
        }
      },
      onHover: (event, elements) => {
        const canvas = event.chart ? event.chart.canvas : (event.native ? event.native.target : null);
        if (canvas) canvas.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#cbd5e1',
            boxWidth: 12,
            font: { family: 'Inter', size: 11 },
            padding: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              if (total === 0) return ' Chưa có dữ liệu bài viết';
              const val = context.raw || 0;
              const pct = Math.round((val / total) * 100);
              return ` ${context.label}: ${val} bài (${pct}%)`;
            },
            footer: function () {
              return '👉 Bấm để lọc bài viết theo loại này';
            }
          }
        }
      }
    }
  });
}

/**
 * Biểu đồ 3: Xếp hạng top quản trị viên (Horizontal Bar Chart)
 */
function renderPublisherChart(publishers = []) {
  const canvas = document.getElementById('publisherChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (publisherChartInstance) {
    publisherChartInstance.destroy();
    publisherChartInstance = null;
  }

  const validPubs = (publishers || []).slice(0, 7);
  const labels = validPubs.map(p => p.publisher_name || 'Khác');
  const engagements = validPubs.map(p => p.total_engagements || 0);

  // Tô màu nổi bật nếu thanh này đang được chọn lọc
  const backgroundColors = validPubs.map(p => 
    state.publisher && state.publisher === p.publisher_name ? '#fbbf24' : 'rgba(99, 102, 241, 0.75)'
  );
  const borderColors = validPubs.map(p => 
    state.publisher && state.publisher === p.publisher_name ? '#f59e0b' : '#818cf8'
  );
  const hoverColors = validPubs.map(p => 
    state.publisher && state.publisher === p.publisher_name ? '#f59e0b' : '#6366f1'
  );

  const ctx = canvas.getContext('2d');
  publisherChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Tổng tương tác',
          data: engagements,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
          borderRadius: 6,
          hoverBackgroundColor: hoverColors
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          const pub = validPubs[index];
          if (pub && pub.publisher_name) {
            filterByPublisher(pub.publisher_name);
          }
        }
      },
      onHover: (event, elements) => {
        const canvas = event.chart ? event.chart.canvas : (event.native ? event.native.target : null);
        if (canvas) canvas.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(99, 102, 241, 0.4)',
          borderWidth: 1,
          callbacks: {
            afterLabel: function (context) {
              const pub = validPubs[context.dataIndex];
              return pub ? `Số lượng: ${pub.post_count} bài đăng` : '';
            },
            footer: function () {
              return '👉 Bấm vào thanh để lọc danh sách bài viết';
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#e2e8f0',
            font: { family: 'Inter', size: 11, weight: '500' }
          }
        }
      }
    }
  });
}

// ==========================================================================
// AUTOMATION & TELEGRAM BOT MODAL
// ==========================================================================

const automationModal = document.getElementById('automationModal');
const btnOpenAutomationModal = document.getElementById('btnOpenAutomationModal');
const btnCloseAutomationModal = document.getElementById('btnCloseAutomationModal');
const btnCancelAutomationModal = document.getElementById('btnCancelAutomationModal');
const btnSaveAutomation = document.getElementById('btnSaveAutomation');
const btnTestTelegram = document.getElementById('btnTestTelegram');
const btnTriggerAutoNow = document.getElementById('btnTriggerAutoNow');

const autoSyncEnabled = document.getElementById('autoSyncEnabled');
const autoIntervalHours = document.getElementById('autoIntervalHours');
const autoLookbackDays = document.getElementById('autoLookbackDays');
const telegramBotToken = document.getElementById('telegramBotToken');
const telegramChatId = document.getElementById('telegramChatId');
const telegramNotifyOnSync = document.getElementById('telegramNotifyOnSync');

const autoStatusDot = document.getElementById('autoStatusDot');
const autoStatusTitle = document.getElementById('autoStatusTitle');
const autoNextRunBadge = document.getElementById('autoNextRunBadge');
const autoLastRunTime = document.getElementById('autoLastRunTime');
const autoLastRunStatus = document.getElementById('autoLastRunStatus');
const automationResultBox = document.getElementById('automationResultBox');
const headerAutoBadge = document.getElementById('headerAutoBadge');

function openAutomationModal() {
  if (automationModal) {
    automationModal.style.display = 'flex';
    fetchAutomationStatus();
  }
}

function closeAutomationModal() {
  if (automationModal) automationModal.style.display = 'none';
}

if (btnOpenAutomationModal) btnOpenAutomationModal.addEventListener('click', openAutomationModal);
if (btnCloseAutomationModal) btnCloseAutomationModal.addEventListener('click', closeAutomationModal);
if (btnCancelAutomationModal) btnCancelAutomationModal.addEventListener('click', closeAutomationModal);
if (automationModal) {
  automationModal.addEventListener('click', (e) => {
    if (e.target === automationModal) closeAutomationModal();
  });
}

/**
 * Tải thông tin trạng thái Scheduler & Telegram Bot
 */
async function fetchAutomationStatus() {
  try {
    const res = await fetch('/api/automation/status');
    const data = await res.json();

    if (!data.ok) return;

    // Cập nhật form
    if (autoSyncEnabled) autoSyncEnabled.checked = !!data.enabled;
    if (autoIntervalHours) autoIntervalHours.value = String(data.intervalHours || 6);
    if (autoLookbackDays) autoLookbackDays.value = String(data.lookbackDays || 7);
    if (telegramNotifyOnSync) telegramNotifyOnSync.checked = data.telegramNotify !== false;

    // Cập nhật header badge
    if (headerAutoBadge) {
      if (data.enabled) {
        headerAutoBadge.innerHTML = '🤖 Tự động: <span style="color: #34d399; font-weight: 700;">BẬT</span>';
      } else {
        headerAutoBadge.innerHTML = '🤖 Tự động hóa & Bot';
      }
    }

    // Cập nhật status card trong modal
    if (autoStatusDot) {
      autoStatusDot.style.background = data.enabled ? '#10b981' : '#94a3b8';
      if (data.isRunning) autoStatusDot.style.background = '#f59e0b';
    }
    if (autoStatusTitle) {
      if (data.isRunning) {
        autoStatusTitle.textContent = 'Đang trong tiến trình quét tự động...';
        autoStatusTitle.style.color = '#f59e0b';
      } else if (data.enabled) {
        autoStatusTitle.textContent = `Chế độ tự động đang BẬT (Mỗi ${data.intervalHours}h)`;
        autoStatusTitle.style.color = '#34d399';
      } else {
        autoStatusTitle.textContent = 'Chế độ tự động đang TẮT';
        autoStatusTitle.style.color = 'var(--text-primary)';
      }
    }
    if (autoNextRunBadge) {
      if (data.enabled && data.nextRunTime) {
        const d = new Date(data.nextRunTime);
        const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString('vi-VN');
        autoNextRunBadge.textContent = `Lần tới: ${timeStr} ${dateStr}`;
      } else {
        autoNextRunBadge.textContent = 'Chưa lên lịch';
      }
    }
    if (autoLastRunTime) {
      if (data.lastRunTime) {
        autoLastRunTime.textContent = new Date(data.lastRunTime).toLocaleString('vi-VN');
      } else {
        autoLastRunTime.textContent = 'Chưa chạy';
      }
    }
    if (autoLastRunStatus) {
      if (data.lastResult) {
        if (data.lastResult.ok) {
          autoLastRunStatus.innerHTML = '<span style="color: #34d399;">✅ Thành công</span>';
        } else {
          autoLastRunStatus.innerHTML = `<span style="color: #f87171;">❌ ${data.lastResult.error || 'Lỗi'}</span>`;
        }
      } else {
        autoLastRunStatus.textContent = '-';
      }
    }
  } catch (err) {
    console.warn('[Automation] Lỗi lấy status:', err);
  }
}

// Lưu cấu hình Tự động hóa & Telegram
if (btnSaveAutomation) {
  btnSaveAutomation.addEventListener('click', async () => {
    const spinner = document.getElementById('saveAutoSpinner');
    btnSaveAutomation.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const payload = {
        enabled: autoSyncEnabled ? autoSyncEnabled.checked : false,
        intervalHours: autoIntervalHours ? autoIntervalHours.value : 6,
        lookbackDays: autoLookbackDays ? autoLookbackDays.value : 7,
        telegramNotify: telegramNotifyOnSync ? telegramNotifyOnSync.checked : true
      };

      if (telegramBotToken && telegramBotToken.value.trim()) {
        payload.telegramToken = telegramBotToken.value.trim();
      }
      if (telegramChatId && telegramChatId.value.trim()) {
        payload.telegramChatId = telegramChatId.value.trim();
      }

      const res = await fetch('/api/automation/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        showToast({
          type: 'success',
          title: 'Lưu cấu hình thành công',
          message: data.message || 'Cấu hình Tự động hóa & Telegram đã được lưu vào .env'
        });
        fetchAutomationStatus();
        closeAutomationModal();
      } else {
        showToast({
          type: 'error',
          title: 'Lỗi lưu cấu hình',
          message: data.error || 'Không thể lưu cấu hình'
        });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Lỗi kết nối', message: err.message });
    } finally {
      btnSaveAutomation.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  });
}

// Thử nghiệm gửi Telegram
if (btnTestTelegram) {
  btnTestTelegram.addEventListener('click', async () => {
    const spinner = document.getElementById('testTeleSpinner');
    btnTestTelegram.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (automationResultBox) {
      automationResultBox.style.display = 'block';
      automationResultBox.innerHTML = '<span class="spinner-sm"></span> Đang gửi tin nhắn kiểm tra tới Telegram API...';
    }

    try {
      const token = telegramBotToken ? telegramBotToken.value.trim() : '';
      const chatId = telegramChatId ? telegramChatId.value.trim() : '';

      const res = await fetch('/api/automation/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, chatId })
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        showToast({
          type: 'success',
          title: 'Kết nối Telegram thành công!',
          message: 'Đã gửi tin nhắn thử nghiệm tới nhóm/kênh của bạn.'
        });
        if (automationResultBox) {
          automationResultBox.innerHTML = `
            <div style="color: #34d399; font-weight: 600; margin-bottom: 0.25rem;">
              ✅ KẾT NỐI TELEGRAM BOT THÀNH CÔNG!
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
              Tin nhắn thử nghiệm đã xuất hiện trên ứng dụng Telegram của bạn.
            </div>
          `;
        }
      } else {
        showToast({
          type: 'error',
          title: 'Không thể kết nối Telegram',
          message: data.error || 'Vui lòng kiểm tra lại Bot Token và Chat ID'
        });
        if (automationResultBox) {
          automationResultBox.innerHTML = `
            <div style="color: #f87171; font-weight: 600; margin-bottom: 0.25rem;">
              ❌ LỖI KẾT NỐI TELEGRAM
            </div>
            <div style="font-size: 0.8rem; color: #fca5a5;">
              ${escapeHtml(data.error || 'Token hoặc Chat ID không chính xác.')}
            </div>
          `;
        }
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Lỗi mạng', message: err.message });
      if (automationResultBox) {
        automationResultBox.innerHTML = `<span style="color: #f87171;">❌ ${escapeHtml(err.message)}</span>`;
      }
    } finally {
      btnTestTelegram.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  });
}

// Chạy chu trình tự động ngay lập tức
if (btnTriggerAutoNow) {
  btnTriggerAutoNow.addEventListener('click', async () => {
    const spinner = document.getElementById('triggerAutoSpinner');
    btnTriggerAutoNow.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/automation/run-now', { method: 'POST' });
      const data = await res.json();

      if (res.ok && data.ok) {
        showToast({
          type: 'success',
          title: 'Đã kích hoạt đồng bộ',
          message: 'Hệ thống đang chạy ngầm lấy bài viết và trích xuất dữ liệu.'
        });
        closeAutomationModal();
        startJobPolling();
      } else {
        showToast({
          type: 'warning',
          title: 'Không thể kích hoạt',
          message: data.error || 'Hệ thống đang bận'
        });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Lỗi kết nối', message: err.message });
    } finally {
      btnTriggerAutoNow.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  });
}

// ==========================================================================
// USER AUTHENTICATION & EMAIL VERIFICATION MODULE
// ==========================================================================

const AUTH_TOKEN_KEY = 'fb_stat_auth_token';
let currentPendingEmail = '';
let resendTimerInterval = null;

// DOM Elements
const btnOpenAuthModal = document.getElementById('btnOpenAuthModal');
const btnAuthText = document.getElementById('btnAuthText');
const userProfileBadge = document.getElementById('userProfileBadge');
const userAvatarText = document.getElementById('userAvatarText');
const userNameText = document.getElementById('userNameText');
const userRoleBadge = document.getElementById('userRoleBadge');
const btnLogout = document.getElementById('btnLogout');

const authModal = document.getElementById('authModal');
const btnCloseAuthModal = document.getElementById('btnCloseAuthModal');
const authModalTitle = document.getElementById('authModalTitle');
const authAlertBox = document.getElementById('authAlertBox');
const authNavTabs = document.getElementById('authNavTabs');

const tabAuthLogin = document.getElementById('tabAuthLogin');
const tabAuthRegister = document.getElementById('tabAuthRegister');
const tabAuthSmtp = document.getElementById('tabAuthSmtp');

const authViewLogin = document.getElementById('authViewLogin');
const authViewRegister = document.getElementById('authViewRegister');
const authViewVerify = document.getElementById('authViewVerify');
const authViewForgot = document.getElementById('authViewForgot');
const authViewSmtp = document.getElementById('authViewSmtp');

// Login Form
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const btnSubmitLogin = document.getElementById('btnSubmitLogin');
const linkToForgot = document.getElementById('linkToForgot');
const linkToRegister = document.getElementById('linkToRegister');

// Register Form
const registerName = document.getElementById('registerName');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerConfirmPassword = document.getElementById('registerConfirmPassword');
const btnSubmitRegister = document.getElementById('btnSubmitRegister');
const linkToLogin = document.getElementById('linkToLogin');

// Verify OTP View
const verifyEmailDisplay = document.getElementById('verifyEmailDisplay');
const otpInput = document.getElementById('otpInput');
const btnSubmitVerify = document.getElementById('btnSubmitVerify');
const btnResendOtp = document.getElementById('btnResendOtp');
const btnBackFromVerify = document.getElementById('btnBackFromVerify');

// Forgot Password View
const forgotEmail = document.getElementById('forgotEmail');
const forgotResetFields = document.getElementById('forgotResetFields');
const forgotOtpCode = document.getElementById('forgotOtpCode');
const forgotNewPassword = document.getElementById('forgotNewPassword');
const btnSubmitForgot = document.getElementById('btnSubmitForgot');
const forgotBtnText = document.getElementById('forgotBtnText');
const btnBackToLogin = document.getElementById('btnBackToLogin');

// SMTP Settings View
const smtpUser = document.getElementById('smtpUser');
const smtpPass = document.getElementById('smtpPass');
const btnTestSmtp = document.getElementById('btnTestSmtp');
const btnSaveSmtp = document.getElementById('btnSaveSmtp');

/**
 * Lấy Bearer Authorization Header nếu có token
 */
function getAuthHeader() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

/**
 * Hiển thị thông báo trong Auth Modal
 */
function showAuthAlert(msg, type = 'error') {
  if (!authAlertBox) return;
  authAlertBox.style.display = 'block';
  const isErr = type === 'error';
  authAlertBox.style.background = isErr ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)';
  authAlertBox.style.borderColor = isErr ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)';
  authAlertBox.style.color = isErr ? '#fca5a5' : '#86efac';
  authAlertBox.innerHTML = `<strong>${isErr ? '❌ Lỗi: ' : '✅ Thành công: '}</strong>${escapeHtml(msg)}`;
}

function hideAuthAlert() {
  if (authAlertBox) {
    authAlertBox.style.display = 'none';
    authAlertBox.innerHTML = '';
  }
}

/**
 * Chuyển đổi màn hình trong Auth Modal
 */
function switchAuthView(viewName) {
  hideAuthAlert();
  [authViewLogin, authViewRegister, authViewVerify, authViewForgot, authViewSmtp].forEach(v => {
    if (v) v.style.display = 'none';
  });

  // Quản lý hiển thị tab bar
  const isMainTab = ['login', 'register', 'smtp'].includes(viewName);
  if (authNavTabs) authNavTabs.style.display = isMainTab ? 'flex' : 'none';

  if (tabAuthLogin) tabAuthLogin.classList.toggle('active', viewName === 'login');
  if (tabAuthRegister) tabAuthRegister.classList.toggle('active', viewName === 'register');
  if (tabAuthSmtp) tabAuthSmtp.classList.toggle('active', viewName === 'smtp');

  if (viewName === 'login') {
    if (authViewLogin) authViewLogin.style.display = 'block';
    if (authModalTitle) authModalTitle.textContent = 'Đăng Nhập Tài Khoản';
    if (loginEmail) loginEmail.focus();
  } else if (viewName === 'register') {
    if (authViewRegister) authViewRegister.style.display = 'block';
    if (authModalTitle) authModalTitle.textContent = 'Đăng Ký Tài Khoản';
    if (registerName) registerName.focus();
  } else if (viewName === 'verify') {
    if (authViewVerify) authViewVerify.style.display = 'block';
    if (authModalTitle) authModalTitle.textContent = 'Xác Thực Email';
    if (verifyEmailDisplay) verifyEmailDisplay.textContent = currentPendingEmail;
    if (otpInput) {
      otpInput.value = '';
      otpInput.focus();
    }
  } else if (viewName === 'forgot') {
    if (authViewForgot) authViewForgot.style.display = 'block';
    if (authModalTitle) authModalTitle.textContent = 'Khôi Phục Mật Khẩu';
    if (forgotResetFields) forgotResetFields.style.display = 'none';
    if (forgotBtnText) forgotBtnText.textContent = 'Gửi Mã Khôi Phục';
    if (forgotEmail) forgotEmail.focus();
  } else if (viewName === 'smtp') {
    if (authViewSmtp) authViewSmtp.style.display = 'block';
    if (authModalTitle) authModalTitle.textContent = 'Cài Đặt Gmail SMTP';
    fetchSmtpStatus();
  }
}

function openAuthModal(defaultTab = 'login') {
  if (authModal) {
    authModal.style.display = 'flex';
    switchAuthView(defaultTab);
  }
}

function closeAuthModal() {
  if (authModal) authModal.style.display = 'none';
  hideAuthAlert();
}

// Modal open/close listeners
if (btnOpenAuthModal) btnOpenAuthModal.addEventListener('click', () => openAuthModal('login'));
if (btnCloseAuthModal) btnCloseAuthModal.addEventListener('click', closeAuthModal);
if (authModal) {
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeAuthModal();
  });
}

// Tab navigation listeners
if (tabAuthLogin) tabAuthLogin.addEventListener('click', () => switchAuthView('login'));
if (tabAuthRegister) tabAuthRegister.addEventListener('click', () => switchAuthView('register'));
if (tabAuthSmtp) tabAuthSmtp.addEventListener('click', () => switchAuthView('smtp'));
if (linkToRegister) linkToRegister.addEventListener('click', () => switchAuthView('register'));
if (linkToLogin) linkToLogin.addEventListener('click', () => switchAuthView('login'));
if (linkToForgot) linkToForgot.addEventListener('click', () => switchAuthView('forgot'));
if (btnBackToLogin) btnBackToLogin.addEventListener('click', () => switchAuthView('login'));
if (btnBackFromVerify) btnBackFromVerify.addEventListener('click', () => switchAuthView('register'));

/**
 * Kiểm tra trạng thái đăng nhập khi mở web
 */
async function checkAuthStatus() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    renderLoggedOutState();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.ok && data.user) {
      renderLoggedInState(data.user);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      renderLoggedOutState();
    }
  } catch (err) {
    console.warn('[Auth] Lỗi kiểm tra phiên đăng nhập:', err);
  }
}

function renderLoggedInState(user) {
  if (btnOpenAuthModal) btnOpenAuthModal.style.display = 'none';
  if (userProfileBadge) userProfileBadge.style.display = 'inline-flex';

  const btnOpenAdminModal = document.getElementById('btnOpenAdminModal');
  if (btnOpenAdminModal) {
    btnOpenAdminModal.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
  }

  const name = user.fullName || user.email || 'Người dùng';
  const initial = name.charAt(0).toUpperCase();

  if (userAvatarText) userAvatarText.textContent = initial;
  if (userNameText) userNameText.textContent = name;
  if (userRoleBadge) {
    userRoleBadge.textContent = user.role === 'admin' ? '👑 ADMIN' : 'USER';
    userRoleBadge.style.color = user.role === 'admin' ? '#fbbf24' : '#818cf8';
    userRoleBadge.style.fontWeight = user.role === 'admin' ? '700' : '500';
  }
}

function renderLoggedOutState() {
  if (btnOpenAuthModal) btnOpenAuthModal.style.display = 'inline-flex';
  if (userProfileBadge) userProfileBadge.style.display = 'none';

  const btnOpenAdminModal = document.getElementById('btnOpenAdminModal');
  if (btnOpenAdminModal) btnOpenAdminModal.style.display = 'none';
}

// Xử lý ĐĂNG NHẬP
if (btnSubmitLogin) {
  btnSubmitLogin.addEventListener('click', async () => {
    hideAuthAlert();
    const email = loginEmail ? loginEmail.value.trim() : '';
    const password = loginPassword ? loginPassword.value : '';

    if (!email || !password) {
      showAuthAlert('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    const spinner = document.getElementById('loginSpinner');
    btnSubmitLogin.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        renderLoggedInState(data.user);
        closeAuthModal();
        showToast({
          type: 'success',
          title: `Xin chào ${data.user.fullName || data.user.email}!`,
          message: 'Đăng nhập vào hệ thống thành công.'
        });
      } else if (data.requireVerification) {
        // Tài khoản chưa xác thực email -> Chuyển sang màn hình nhập OTP
        currentPendingEmail = data.email || email;
        switchAuthView('verify');
        let infoMsg = 'Tài khoản của bạn chưa được kích hoạt. Hãy nhập mã OTP 6 số để kích hoạt.';
        if (data.simulatedCode) {
          infoMsg += ` [Chế độ mô phỏng: Mã OTP của bạn là ${data.simulatedCode}]`;
        }
        showAuthAlert(infoMsg, 'info');
      } else {
        showAuthAlert(data.error || 'Email hoặc mật khẩu không chính xác.');
      }
    } catch (err) {
      showAuthAlert(`Lỗi kết nối máy chủ: ${err.message}`);
    } finally {
      btnSubmitLogin.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  });
}

// Xử lý ĐĂNG KÝ
if (btnSubmitRegister) {
  btnSubmitRegister.addEventListener('click', async () => {
    hideAuthAlert();
    const fullName = registerName ? registerName.value.trim() : '';
    const email = registerEmail ? registerEmail.value.trim() : '';
    const password = registerPassword ? registerPassword.value : '';
    const confirmPassword = registerConfirmPassword ? registerConfirmPassword.value : '';

    if (!fullName) {
      showAuthAlert('Vui lòng nhập họ và tên của bạn.');
      return;
    }
    if (!email) {
      showAuthAlert('Vui lòng nhập địa chỉ email.');
      return;
    }
    if (!password || password.length < 6) {
      showAuthAlert('Mật khẩu phải có độ dài tối thiểu 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      showAuthAlert('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    const spinner = document.getElementById('registerSpinner');
    btnSubmitRegister.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        currentPendingEmail = data.email || email;
        switchAuthView('verify');
        let successMsg = `Hệ thống đã gửi mã OTP kích hoạt tới email ${currentPendingEmail}. Vui lòng kiểm tra hộp thư!`;
        if (data.simulatedCode) {
          successMsg += ` (⚡ MÃ OTP MÔ PHỎNG: ${data.simulatedCode})`;
        }
        showAuthAlert(successMsg, 'success');
      } else {
        showAuthAlert(data.error || 'Đăng ký tài khoản không thành công.');
      }
    } catch (err) {
      showAuthAlert(`Lỗi kết nối máy chủ: ${err.message}`);
    } finally {
      btnSubmitRegister.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  });
}

// Xử lý XÁC THỰC MÃ OTP
if (btnSubmitVerify) {
  btnSubmitVerify.addEventListener('click', async () => {
    hideAuthAlert();
    const code = otpInput ? otpInput.value.trim() : '';

    if (!code || code.length !== 6) {
      showAuthAlert('Vui lòng nhập đầy đủ 6 chữ số mã OTP.');
      return;
    }

    const spinner = document.getElementById('verifySpinner');
    btnSubmitVerify.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentPendingEmail, code })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        if (data.token) {
          localStorage.setItem(AUTH_TOKEN_KEY, data.token);
          renderLoggedInState(data.user);
        }
        closeAuthModal();
        showToast({
          type: 'success',
          title: 'Kích hoạt tài khoản thành công! 🎉',
          message: 'Tài khoản của bạn đã được xác minh. Chúc bạn có trải nghiệm tuyệt vời!'
        });
      } else {
        showAuthAlert(data.error || 'Mã xác nhận không hợp lệ hoặc đã hết hạn.');
      }
    } catch (err) {
      showAuthAlert(`Lỗi kết nối máy chủ: ${err.message}`);
    } finally {
      btnSubmitVerify.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  });
}

// Xử lý GỬI LẠI MÃ OTP (Resend OTP)
if (btnResendOtp) {
  btnResendOtp.addEventListener('click', async () => {
    if (!currentPendingEmail) return;

    btnResendOtp.disabled = true;
    btnResendOtp.textContent = 'Đang gửi...';

    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentPendingEmail })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        let msg = 'Đã gửi mã OTP mới tới email của bạn.';
        if (data.simulatedCode) msg += ` (⚡ MÃ OTP MÔ PHỎNG: ${data.simulatedCode})`;
        showAuthAlert(msg, 'success');

        // Bắt đầu đếm ngược 60 giây
        let countdown = 60;
        clearInterval(resendTimerInterval);
        resendTimerInterval = setInterval(() => {
          countdown--;
          if (countdown > 0) {
            btnResendOtp.textContent = `Gửi lại sau (${countdown}s)`;
          } else {
            clearInterval(resendTimerInterval);
            btnResendOtp.disabled = false;
            btnResendOtp.textContent = 'Chưa nhận được? Gửi lại mã';
          }
        }, 1000);
      } else {
        showAuthAlert(data.error || 'Không thể gửi lại mã.');
        btnResendOtp.disabled = false;
        btnResendOtp.textContent = 'Chưa nhận được? Gửi lại mã';
      }
    } catch (err) {
      showAuthAlert(`Lỗi: ${err.message}`);
      btnResendOtp.disabled = false;
      btnResendOtp.textContent = 'Chưa nhận được? Gửi lại mã';
    }
  });
}

// Xử lý ĐĂNG XUẤT
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {}
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    renderLoggedOutState();
    showToast({
      type: 'info',
      title: 'Đã đăng xuất',
      message: 'Bạn đã đăng xuất khỏi phiên làm việc an toàn.'
    });
  });
}

// Xử lý QUÊN MẬT KHẨU
if (btnSubmitForgot) {
  btnSubmitForgot.addEventListener('click', async () => {
    hideAuthAlert();
    const email = forgotEmail ? forgotEmail.value.trim() : '';
    if (!email) {
      showAuthAlert('Vui lòng nhập địa chỉ email.');
      return;
    }

    const isResetStep = forgotResetFields && forgotResetFields.style.display !== 'none';
    const spinner = document.getElementById('forgotSpinner');
    btnSubmitForgot.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';

    try {
      if (!isResetStep) {
        // Bước 1: Gửi OTP khôi phục
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (res.ok) {
          if (forgotResetFields) forgotResetFields.style.display = 'flex';
          if (forgotBtnText) forgotBtnText.textContent = 'Đặt Lại Mật Khẩu Mới';
          let msg = data.message || 'Mã OTP khôi phục đã được gửi tới email của bạn.';
          if (data.simulatedCode) msg += ` (⚡ MÃ OTP MÔ PHỎNG: ${data.simulatedCode})`;
          showAuthAlert(msg, 'success');
        } else {
          showAuthAlert(data.error || 'Có lỗi xảy ra.');
        }
      } else {
        // Bước 2: Đổi mật khẩu với OTP
        const code = forgotOtpCode ? forgotOtpCode.value.trim() : '';
        const newPassword = forgotNewPassword ? forgotNewPassword.value : '';

        if (!code || !newPassword || newPassword.length < 6) {
          showAuthAlert('Vui lòng nhập đúng 6 số OTP và mật khẩu mới tối thiểu 6 ký tự.');
          return;
        }

        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code, newPassword })
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          showToast({
            type: 'success',
            title: 'Đặt lại mật khẩu thành công!',
            message: 'Vui lòng đăng nhập bằng mật khẩu mới của bạn.'
          });
          switchAuthView('login');
          if (loginEmail) loginEmail.value = email;
          if (loginPassword) loginPassword.value = '';
        } else {
          showAuthAlert(data.error || 'Mã xác nhận không đúng hoặc đã hết hạn.');
        }
      }
    } catch (err) {
      showAuthAlert(`Lỗi kết nối: ${err.message}`);
    } finally {
      btnSubmitForgot.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  });
}

// Xử lý CÀI ĐẶT GMAIL SMTP
async function fetchSmtpStatus() {
  try {
    const res = await fetch('/api/auth/smtp-status');
    const data = await res.json();
    if (res.ok && data.ok) {
      if (data.isConfigured) {
        showAuthAlert(`Hệ thống đang kết nối hòm thư: ${data.user || 'Gmail'} (Port ${data.port})`, 'success');
      } else {
        showAuthAlert('Hệ thống đang ở chế độ MÔ PHỎNG (in OTP ra terminal). Bạn có thể cấu hình Gmail bên dưới để gửi thư thật.', 'info');
      }
    }
  } catch (e) {}
}

if (btnTestSmtp) {
  btnTestSmtp.addEventListener('click', async () => {
    hideAuthAlert();
    const user = smtpUser ? smtpUser.value.trim() : '';
    const pass = smtpPass ? smtpPass.value.trim() : '';

    if (!user || !pass) {
      showAuthAlert('Vui lòng nhập Email Gmail và Mật khẩu ứng dụng 16 chữ cái để kiểm tra.');
      return;
    }

    const spinner = document.getElementById('testSmtpSpinner');
    btnTestSmtp.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/auth/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass, saveConfig: false })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        showAuthAlert('Xác thực Gmail SMTP thành công 100%! Bạn có thể bấm "Lưu Cấu Hình".', 'success');
      } else {
        showAuthAlert(data.error || 'Không thể kết nối tới Gmail SMTP.', 'error');
      }
    } catch (err) {
      showAuthAlert(`Lỗi kết nối: ${err.message}`);
    } finally {
      btnTestSmtp.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  });
}

if (btnSaveSmtp) {
  btnSaveSmtp.addEventListener('click', async () => {
    hideAuthAlert();
    const user = smtpUser ? smtpUser.value.trim() : '';
    const pass = smtpPass ? smtpPass.value.trim() : '';

    if (!user || !pass) {
      showAuthAlert('Vui lòng nhập Email Gmail và Mật khẩu ứng dụng để lưu.');
      return;
    }

    try {
      const res = await fetch('/api/auth/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass, saveConfig: true })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        showToast({
          type: 'success',
          title: 'Lưu cấu hình Gmail thành công!',
          message: 'Từ bây giờ, toàn bộ mã xác thực OTP sẽ được gửi trực tiếp tới email người dùng.'
        });
        showAuthAlert('Đã lưu thông tin Gmail SMTP thành công vào .env!', 'success');
      } else {
        showAuthAlert(data.error || 'Không thể lưu cấu hình.');
      }
    } catch (err) {
      showAuthAlert(`Lỗi: ${err.message}`);
    }
  });
}

// ==========================================================================
// MODULE 10: BẢNG ĐIỀU KHIỂN QUẢN TRỊ VIÊN HỆ THỐNG (ADMIN DASHBOARD)
// ==========================================================================

const btnOpenAdminModal = document.getElementById('btnOpenAdminModal');
const adminDashboardModal = document.getElementById('adminDashboardModal');
const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
const adminAlertBox = document.getElementById('adminAlertBox');

const adminTotalUsers = document.getElementById('adminTotalUsers');
const adminTotalAdmins = document.getElementById('adminTotalAdmins');
const adminTotalVerified = document.getElementById('adminTotalVerified');
const adminTotalSessions = document.getElementById('adminTotalSessions');

const adminSearchInput = document.getElementById('adminSearchInput');
const adminRoleSelect = document.getElementById('adminRoleSelect');
const btnRefreshAdmin = document.getElementById('btnRefreshAdmin');

const btnToggleAddUserForm = document.getElementById('btnToggleAddUserForm');
const adminAddUserPanel = document.getElementById('adminAddUserPanel');
const formAdminCreateUser = document.getElementById('formAdminCreateUser');
const newAdminFullName = document.getElementById('newAdminFullName');
const newAdminEmail = document.getElementById('newAdminEmail');
const newAdminPassword = document.getElementById('newAdminPassword');
const newAdminRole = document.getElementById('newAdminRole');
const newAdminVerified = document.getElementById('newAdminVerified');
const btnCancelAddUser = document.getElementById('btnCancelAddUser');
const btnSubmitAdminCreateUser = document.getElementById('btnSubmitAdminCreateUser');
const createUserSpinner = document.getElementById('createUserSpinner');

const adminUsersTableBody = document.getElementById('adminUsersTableBody');

function getAuthHeaders() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

function showAdminAlert(msg, type = 'error') {
  if (!adminAlertBox) return;
  adminAlertBox.textContent = msg;
  adminAlertBox.className = `test-result-box ${type === 'success' ? 'test-result-success' : 'test-result-error'}`;
  adminAlertBox.style.display = 'block';
}

function hideAdminAlert() {
  if (!adminAlertBox) return;
  adminAlertBox.style.display = 'none';
}

function openAdminDashboard() {
  if (adminDashboardModal) adminDashboardModal.style.display = 'flex';
  hideAdminAlert();
  if (adminAddUserPanel) adminAddUserPanel.style.display = 'none';
  loadAdminStats();
  loadAdminUsers();
}

function closeAdminDashboard() {
  if (adminDashboardModal) adminDashboardModal.style.display = 'none';
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    const data = await res.json();
    if (res.ok && data.ok && data.stats) {
      if (adminTotalUsers) adminTotalUsers.textContent = data.stats.totalUsers || 0;
      if (adminTotalAdmins) adminTotalAdmins.textContent = data.stats.adminCount || 0;
      if (adminTotalVerified) adminTotalVerified.textContent = data.stats.verifiedCount || 0;
      if (adminTotalSessions) adminTotalSessions.textContent = data.stats.activeSessions || 0;
    }
  } catch (err) {
    console.error('Lỗi khi tải thống kê admin:', err);
  }
}

async function loadAdminUsers() {
  if (!adminUsersTableBody) return;
  adminUsersTableBody.innerHTML = `
    <tr>
      <td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">
        <span class="spinner-sm" style="display: inline-block; vertical-align: middle; margin-right: 0.5rem;"></span>
        Đang tải danh sách thành viên...
      </td>
    </tr>
  `;

  const search = adminSearchInput ? adminSearchInput.value.trim() : '';
  const role = adminRoleSelect ? adminRoleSelect.value : '';

  try {
    const url = `/api/admin/users?search=${encodeURIComponent(search)}&role=${encodeURIComponent(role)}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      showAdminAlert(data.error || 'Không thể tải danh sách người dùng.');
      adminUsersTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f87171; padding: 1rem;">Lỗi tải dữ liệu.</td></tr>`;
      return;
    }

    const users = data.users || [];
    if (users.length === 0) {
      adminUsersTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">
            Không tìm thấy thành viên nào phù hợp.
          </td>
        </tr>
      `;
      return;
    }

    adminUsersTableBody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      const initial = (u.full_name || u.email || 'U').charAt(0).toUpperCase();
      const isAdmin = u.role === 'admin';
      const isVerified = u.is_verified === 1;

      const createdDate = u.created_at ? new Date(u.created_at).toLocaleString('vi-VN') : '---';

      tr.innerHTML = `
        <td style="padding: 0.85rem 1rem;">
          <div class="admin-user-cell">
            <span class="admin-avatar ${isAdmin ? 'admin-role' : ''}">${initial}</span>
            <div>
              <span class="admin-user-name">${escapeHtml(u.full_name || 'Chưa đặt tên')}</span>
              <span class="admin-user-email">${escapeHtml(u.email)}</span>
            </div>
          </div>
        </td>
        <td style="padding: 0.85rem 1rem;">
          <span class="role-badge ${isAdmin ? 'role-badge-admin' : 'role-badge-user'}">
            ${isAdmin ? '👑 Quản Trị Viên' : '👤 Người Dùng'}
          </span>
        </td>
        <td style="padding: 0.85rem 1rem;">
          <span class="status-badge ${isVerified ? 'status-badge-verified' : 'status-badge-unverified'}">
            ${isVerified ? '✅ Đã kích hoạt' : '⏳ Chờ xác nhận'}
          </span>
        </td>
        <td style="padding: 0.85rem 1rem; color: var(--text-secondary); font-size: 0.8rem;">
          ${createdDate}
        </td>
        <td style="padding: 0.85rem 1rem; text-align: right;">
          <div style="display: inline-flex; gap: 0.4rem; justify-content: flex-end;">
            <button type="button" class="btn-admin-action" data-action="toggle-role" data-id="${u.id}" data-role="${u.role}" data-name="${escapeHtml(u.full_name || u.email)}" title="${isAdmin ? 'Hạ quyền xuống User' : 'Nâng quyền thành Admin'}">
              ${isAdmin ? '👤 Hạ User' : '👑 Lên Admin'}
            </button>
            <button type="button" class="btn-admin-action" data-action="toggle-status" data-id="${u.id}" data-verified="${u.is_verified}" data-name="${escapeHtml(u.full_name || u.email)}" title="${isVerified ? 'Tạm khóa tài khoản' : 'Kích hoạt ngay'}">
              ${isVerified ? '🔒 Khóa' : '⚡ Kích hoạt'}
            </button>
            <button type="button" class="btn-admin-action btn-admin-action-danger" data-action="delete-user" data-id="${u.id}" data-email="${escapeHtml(u.email)}" title="Xóa tài khoản vĩnh viễn">
              🗑️ Xóa
            </button>
          </div>
        </td>
      `;
      adminUsersTableBody.appendChild(tr);
    });

  } catch (err) {
    console.error('Lỗi khi tải danh sách users:', err);
    adminUsersTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f87171; padding: 1rem;">Lỗi kết nối.</td></tr>`;
  }
}

// Xử lý các nút thao tác trên bảng thành viên (Event Delegation)
if (adminUsersTableBody) {
  adminUsersTableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const userId = btn.dataset.id;
    const name = btn.dataset.name;
    const email = btn.dataset.email;

    if (action === 'toggle-role') {
      const currentRole = btn.dataset.role;
      const targetRole = currentRole === 'admin' ? 'user' : 'admin';
      const confirmText = `Bạn có chắc muốn đổi vai trò của "${name}" thành ${targetRole === 'admin' ? 'Quản Trị Viên (Admin)' : 'Người Dùng (User)'}?`;
      if (!confirm(confirmText)) return;

      try {
        const res = await fetch(`/api/admin/users/${userId}/role`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ role: targetRole })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          showToast({ type: 'success', title: 'Cập nhật thành công', message: data.message });
          loadAdminStats();
          loadAdminUsers();
        } else {
          showAdminAlert(data.error || 'Không thể cập nhật vai trò.');
        }
      } catch (err) {
        showAdminAlert(`Lỗi: ${err.message}`);
      }
    } else if (action === 'toggle-status') {
      const isCurrentlyVerified = btn.dataset.verified === '1';
      const targetStatus = !isCurrentlyVerified;
      const confirmText = `Xác nhận ${targetStatus ? 'KÍCH HOẠT' : 'TẠM KHÓA'} tài khoản "${name}"?`;
      if (!confirm(confirmText)) return;

      try {
        const res = await fetch(`/api/admin/users/${userId}/status`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ isVerified: targetStatus })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          showToast({ type: 'success', title: 'Thao tác thành công', message: data.message });
          loadAdminStats();
          loadAdminUsers();
        } else {
          showAdminAlert(data.error || 'Không thể thay đổi trạng thái.');
        }
      } catch (err) {
        showAdminAlert(`Lỗi: ${err.message}`);
      }
    } else if (action === 'delete-user') {
      const confirmText = `CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${email}"?\nToàn bộ phiên đăng nhập và dữ liệu liên quan sẽ bị xóa sạch!`;
      if (!confirm(confirmText)) return;

      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          showToast({ type: 'success', title: 'Đã xóa tài khoản', message: data.message });
          loadAdminStats();
          loadAdminUsers();
        } else {
          showAdminAlert(data.error || 'Không thể xóa tài khoản.');
        }
      } catch (err) {
        showAdminAlert(`Lỗi: ${err.message}`);
      }
    }
  });
}

// Các sự kiện cho Admin Dashboard
if (btnOpenAdminModal) btnOpenAdminModal.addEventListener('click', openAdminDashboard);
if (btnCloseAdminModal) btnCloseAdminModal.addEventListener('click', closeAdminDashboard);
if (btnRefreshAdmin) {
  btnRefreshAdmin.addEventListener('click', () => {
    loadAdminStats();
    loadAdminUsers();
  });
}

if (adminSearchInput) {
  let searchTimeout = null;
  adminSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadAdminUsers, 300);
  });
}

if (adminRoleSelect) {
  adminRoleSelect.addEventListener('change', loadAdminUsers);
}

if (btnToggleAddUserForm) {
  btnToggleAddUserForm.addEventListener('click', () => {
    if (!adminAddUserPanel) return;
    const isHidden = adminAddUserPanel.style.display === 'none';
    adminAddUserPanel.style.display = isHidden ? 'block' : 'none';
    if (isHidden && newAdminFullName) newAdminFullName.focus();
  });
}

if (btnCancelAddUser) {
  btnCancelAddUser.addEventListener('click', () => {
    if (adminAddUserPanel) adminAddUserPanel.style.display = 'none';
  });
}

// Xử lý tạo tài khoản mới từ Admin
if (btnSubmitAdminCreateUser) {
  btnSubmitAdminCreateUser.addEventListener('click', async () => {
    hideAdminAlert();
    const fullName = newAdminFullName ? newAdminFullName.value.trim() : '';
    const email = newAdminEmail ? newAdminEmail.value.trim() : '';
    const password = newAdminPassword ? newAdminPassword.value : '';
    const role = newAdminRole ? newAdminRole.value : 'user';
    const isVerified = newAdminVerified ? newAdminVerified.checked : true;

    if (!fullName || !email || !password) {
      showAdminAlert('Vui lòng điền đầy đủ Họ tên, Email và Mật khẩu.');
      return;
    }

    if (password.length < 6) {
      showAdminAlert('Mật khẩu phải có độ dài tối thiểu 6 ký tự.');
      return;
    }

    btnSubmitAdminCreateUser.disabled = true;
    if (createUserSpinner) createUserSpinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ fullName, email, password, role, isVerified })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        showToast({
          type: 'success',
          title: 'Tạo tài khoản thành công!',
          message: `Đã tạo tài khoản cho ${email} (${role.toUpperCase()}).`
        });
        showAdminAlert(`Đã tạo thành công tài khoản: ${email}`, 'success');

        // Reset form
        if (formAdminCreateUser) formAdminCreateUser.reset();
        if (adminAddUserPanel) adminAddUserPanel.style.display = 'none';

        loadAdminStats();
        loadAdminUsers();
      } else {
        showAdminAlert(data.error || 'Không thể tạo tài khoản.');
      }
    } catch (err) {
      showAdminAlert(`Lỗi kết nối: ${err.message}`);
    } finally {
      btnSubmitAdminCreateUser.disabled = false;
      if (createUserSpinner) createUserSpinner.style.display = 'none';
    }
  });
}

// ==========================================================================
// MODAL HƯỚNG DẪN LẤY TOKEN FACEBOOK TỪ ĐẦU ĐẾN CUỐI (TOKEN GUIDE)
// ==========================================================================

const btnOpenTokenGuideModal = document.getElementById('btnOpenTokenGuideModal');
const tokenGuideModal = document.getElementById('tokenGuideModal');
const btnCloseTokenGuideModal = document.getElementById('btnCloseTokenGuideModal');
const btnDismissTokenGuide = document.getElementById('btnDismissTokenGuide');
const btnGuidePrev = document.getElementById('btnGuidePrev');
const btnGuideNext = document.getElementById('btnGuideNext');
const btnGuideGoSettings = document.getElementById('btnGuideGoSettings');
const btnQuickOpenSettings = document.getElementById('btnQuickOpenSettings');

let currentGuideStep = 1;
const totalGuideSteps = 5;

function switchGuideStep(step) {
  if (step < 1) step = 1;
  if (step > totalGuideSteps) step = totalGuideSteps;
  currentGuideStep = step;

  // Cập nhật Buttons trên Stepper
  document.querySelectorAll('.guide-step-btn').forEach(btn => {
    const s = parseInt(btn.dataset.step, 10);
    btn.classList.toggle('active', s === currentGuideStep);
    btn.classList.toggle('completed', s < currentGuideStep);
  });

  // Hiển thị View tương ứng
  for (let i = 1; i <= totalGuideSteps; i++) {
    const view = document.getElementById(`guideStepView${i}`);
    if (view) {
      view.style.display = i === currentGuideStep ? 'block' : 'none';
    }
  }

  // Cập nhật trạng thái nút Prev & Next
  if (btnGuidePrev) {
    btnGuidePrev.style.display = currentGuideStep > 1 ? 'inline-flex' : 'none';
  }
  if (btnGuideNext) {
    if (currentGuideStep === totalGuideSteps) {
      btnGuideNext.innerHTML = '⚙️ Hoàn tất & Mở Cài Đặt';
      btnGuideNext.className = 'btn btn-warning btn-sm';
      btnGuideNext.style.fontWeight = '700';
    } else {
      btnGuideNext.innerHTML = 'Bước tiếp theo ➜';
      btnGuideNext.className = 'btn btn-primary btn-sm';
      btnGuideNext.style.fontWeight = '600';
    }
  }

  // Tự động cuộn phần body lên đầu
  const body = tokenGuideModal ? tokenGuideModal.querySelector('.guide-modal-body') : null;
  if (body) body.scrollTop = 0;
}

function openTokenGuideModal() {
  if (!tokenGuideModal) return;
  tokenGuideModal.style.display = 'flex';
  switchGuideStep(1);
}

function closeTokenGuideModal() {
  if (!tokenGuideModal) return;
  tokenGuideModal.style.display = 'none';
}

if (btnOpenTokenGuideModal) {
  btnOpenTokenGuideModal.addEventListener('click', openTokenGuideModal);
}
if (btnCloseTokenGuideModal) {
  btnCloseTokenGuideModal.addEventListener('click', closeTokenGuideModal);
}
if (btnDismissTokenGuide) {
  btnDismissTokenGuide.addEventListener('click', closeTokenGuideModal);
}
if (tokenGuideModal) {
  tokenGuideModal.addEventListener('click', (e) => {
    if (e.target === tokenGuideModal) closeTokenGuideModal();
  });
}

// Click nút bước trên Stepper
document.querySelectorAll('.guide-step-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const s = parseInt(btn.dataset.step, 10);
    if (!isNaN(s)) switchGuideStep(s);
  });
});

if (btnGuidePrev) {
  btnGuidePrev.addEventListener('click', () => {
    switchGuideStep(currentGuideStep - 1);
  });
}

if (btnGuideNext) {
  btnGuideNext.addEventListener('click', () => {
    if (currentGuideStep < totalGuideSteps) {
      switchGuideStep(currentGuideStep + 1);
    } else {
      closeTokenGuideModal();
      openSettingsModal();
    }
  });
}

function goToSettingsFromGuide() {
  closeTokenGuideModal();
  openSettingsModal();
}
if (btnGuideGoSettings) btnGuideGoSettings.addEventListener('click', goToSettingsFromGuide);
if (btnQuickOpenSettings) btnQuickOpenSettings.addEventListener('click', goToSettingsFromGuide);

// Sao chép nhanh tên quyền
document.querySelectorAll('.btn-copy-perm').forEach(btn => {
  btn.addEventListener('click', async () => {
    const perm = btn.dataset.perm;
    if (!perm) return;
    try {
      await navigator.clipboard.writeText(perm);
      const originalText = btn.textContent;
      btn.textContent = 'Đã chép ✓';
      btn.style.borderColor = '#22c55e';
      btn.style.color = '#22c55e';
      showToast({ type: 'success', title: 'Đã sao chép quyền', message: `Đã lưu "${perm}" vào clipboard.` });
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 2000);
    } catch (e) {
      prompt('Sao chép quyền:', perm);
    }
  });
});

// ==========================================================================
// KHỞI CHẠY ỨNG DỤNG (INITIALIZATION)
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  initDefaultDates();
  checkConfigStatus();
  checkAuthStatus();
  updateSortIndicators();
  fetchStats();
  fetchPosts();
  fetchBatches();
  fetchAutomationStatus();

  // Kiểm tra nếu có job đang chạy ngầm từ trước
  fetch('/api/status').then(r => r.json()).then(j => {
    if (j.isRunning) startJobPolling();
  }).catch(() => {});
});


