// State quản lý ứng dụng client
const state = {
  since: '', // Định dạng YYYY-MM-DD dùng cho API
  until: '', // Định dạng YYYY-MM-DD dùng cho API
  batchId: 'ALL',
  publisher: '',
  status: 'ALL',
  search: '',
  page: 1,
  limit: 20,
  totalPages: 1,
  currentTab: 'batches',
  isJobRunning: false,
  pollingInterval: null,
  configuredPageId: null,
  configuredPageName: null
};

// DOM Elements: Form & Controls
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

// Metrics Cards
const statTotalPosts = document.getElementById('statTotalPosts');
const statFound = document.getElementById('statFound');
const statPending = document.getElementById('statPending');
const statErrors = document.getElementById('statErrors');
const statPublishersCount = document.getElementById('statPublishersCount');

// Navigation Tabs
const tabBtnBatches = document.getElementById('tabBtnBatches');
const tabBtnPosts = document.getElementById('tabBtnPosts');
const tabBtnPublishers = document.getElementById('tabBtnPublishers');
const tabBatchesCount = document.getElementById('tabBatchesCount');
const tabPostsCount = document.getElementById('tabPostsCount');
const tabPubsCount = document.getElementById('tabPubsCount');

// Views
const viewBatches = document.getElementById('viewBatches');
const viewPosts = document.getElementById('viewPosts');
const viewPublishers = document.getElementById('viewPublishers');

// View 1: Batches
const batchesContainer = document.getElementById('batchesContainer');
const btnRefreshBatches = document.getElementById('btnRefreshBatches');

// View 2: Posts Table
const postsTableBody = document.getElementById('postsTableBody');
const filterBatchSelect = document.getElementById('filterBatchSelect');
const filterSearch = document.getElementById('filterSearch');
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

// View 3: Publishers Table
const publisherTableBody = document.getElementById('publisherTableBody');
const btnClearPublisherFilter = document.getElementById('btnClearPublisherFilter');

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

// Test 1 Post Modal Elements
const btnOpenTestModal = document.getElementById('btnOpenTestModal');
const testPostModal = document.getElementById('testPostModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnRunTestPost = document.getElementById('btnRunTestPost');
const testPostUrl = document.getElementById('testPostUrl');
const testResultBox = document.getElementById('testResultBox');
const testSpinner = document.getElementById('testSpinner');

/**
 * Chuyển đổi qua lại giữa DD/MM/YYYY và YYYY-MM-DD
 */
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

/**
 * Tự động gắn mask khi nhập ngày tháng dd/mm/yyyy
 */
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
  });
}

/**
 * Đồng bộ Date Picker ẩn với input text dd/mm/yyyy
 */
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
    }
  });

  textInput.addEventListener('blur', () => {
    const ymd = dmyToYmd(textInput.value.trim());
    if (ymd && ymd.length === 10) {
      nativePicker.value = ymd;
    }
  });
}

function initDefaultDates() {
  const now = new Date();
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(now.getMonth() - 2);

  const defaultSinceDmy = dateToDmy(twoMonthsAgo);
  const defaultUntilDmy = dateToDmy(now);

  sinceDateInput.value = defaultSinceDmy;
  untilDateInput.value = defaultUntilDmy;
  sinceDatePicker.value = dateToYmd(twoMonthsAgo);
  untilDatePicker.value = dateToYmd(now);

  state.since = dateToYmd(twoMonthsAgo);
  state.until = dateToYmd(now);

  setupDatePickerSync(sinceDateInput, sinceDatePicker, btnSinceCalendar);
  setupDatePickerSync(untilDateInput, untilDatePicker, btnUntilCalendar);
}

/**
 * Quản lý chuyển đổi Tabs (Lịch sử đợt / Bài viết / Người đăng)
 */
function switchTab(tabName) {
  state.currentTab = tabName;

  tabBtnBatches.classList.toggle('active', tabName === 'batches');
  tabBtnPosts.classList.toggle('active', tabName === 'posts');
  tabBtnPublishers.classList.toggle('active', tabName === 'publishers');

  viewBatches.style.display = tabName === 'batches' ? 'block' : 'none';
  viewPosts.style.display = tabName === 'posts' ? 'block' : 'none';
  viewPublishers.style.display = tabName === 'publishers' ? 'block' : 'none';

  if (tabName === 'batches') {
    fetchBatches();
  } else if (tabName === 'posts') {
    fetchPosts();
  } else if (tabName === 'publishers') {
    fetchPublishers();
  }
}

tabBtnBatches.addEventListener('click', () => switchTab('batches'));
tabBtnPosts.addEventListener('click', () => switchTab('posts'));
tabBtnPublishers.addEventListener('click', () => switchTab('publishers'));

/**
 * Kiểm tra trạng thái cấu hình backend
 */
async function checkConfigStatus() {
  try {
    const res = await fetch('/api/config-status');
    const data = await res.json();
    const banners = document.getElementById('statusBanners');
    banners.innerHTML = '';

    state.configuredPageId = data.pageId;
    if (settingPageId) settingPageId.value = data.pageId || '';

    if (data.pageId) {
      pageConnectedBadge.style.display = 'inline-flex';
      headerPageInfo.textContent = `Fanpage ID: ${data.pageId}`;
    }

    if (!data.isApiConfigured) {
      banners.innerHTML += `
        <div class="banner banner-warning">
          <span>⚠️ <strong>Chưa hoàn tất cấu hình Facebook:</strong> Vui lòng bấm <strong>"Cài đặt Fanpage & Token"</strong> ở trên để nhập ID Fanpage và Access Token.</span>
        </div>
      `;
    }

    if (!data.isProfilePresent) {
      banners.innerHTML += `
        <div class="banner banner-info">
          <span>ℹ️ <strong>Chưa có phiên đăng nhập Facebook:</strong> Hãy chạy lệnh <code>npm run login</code> trong terminal để mở Chromium đăng nhập Facebook và chuyển sang Fanpage.</span>
        </div>
      `;
    }
  } catch (err) {
    console.error('Lỗi khi lấy config status:', err);
  }
}

/**
 * Cập nhật đường dẫn xuất CSV / Excel
 */
function updateExportLinks() {
  const sinceVal = dmyToYmd(sinceDateInput.value.trim());
  const untilVal = dmyToYmd(untilDateInput.value.trim());

  const params = new URLSearchParams();
  if (sinceVal) params.set('since', sinceVal);
  if (untilVal) params.set('until', untilVal);
  if (state.batchId && state.batchId !== 'ALL') params.set('batchId', state.batchId);
  if (state.publisher) params.set('publisher', state.publisher);
  if (state.status !== 'ALL') params.set('status', state.status);
  if (state.search) params.set('search', state.search);

  const query = params.toString() ? `?${params.toString()}` : '';
  btnExportExcel.href = `/api/export.xlsx${query}`;
  btnExportCsv.href = `/api/export.csv${query}`;
}

/**
 * Lấy danh sách các đợt đồng bộ bài viết (Batches)
 */
async function fetchBatches() {
  try {
    const res = await fetch('/api/batches');
    const batches = await res.json();

    tabBatchesCount.textContent = batches.length || 0;

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
          <p style="margin-top: 0.4rem; color: var(--text-muted);">
            Hãy chọn khoảng ngày bên trên và bấm <strong>"Đồng bộ bài viết"</strong> để tải bài viết từ Facebook.
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
      const notFound = b.not_found_count || 0;
      const pct = total > 0 ? Math.round((found / total) * 100) : 0;

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
            🗓️ ${escapeHtml(b.since_date || 'N/A')} ➜ ${escapeHtml(b.until_date || 'N/A')}
          </div>
        </div>

        <div class="batch-stats-chips">
          <div class="batch-stat-box">
            <span class="batch-stat-val" style="color: #60a5fa;">${total}</span>
            <span class="batch-stat-lbl">Tổng bài</span>
          </div>
          <div class="batch-stat-box">
            <span class="batch-stat-val text-success">${found}</span>
            <span class="batch-stat-lbl">Đã tìm thấy (${pct}%)</span>
          </div>
          <div class="batch-stat-box">
            <span class="batch-stat-val text-warning">${pending}</span>
            <span class="batch-stat-lbl">Chờ xử lý</span>
          </div>
        </div>

        <div class="batch-interactions-row">
          <span>❤️ <strong>${(b.total_likes || 0).toLocaleString()}</strong> thích</span>
          <span>💬 <strong>${(b.total_comments || 0).toLocaleString()}</strong> bình luận</span>
          <span>🔁 <strong>${(b.total_shares || 0).toLocaleString()}</strong> chia sẻ</span>
        </div>

        <div class="batch-card-actions">
          <button class="btn btn-sm btn-primary btn-view-batch" data-batch-id="${escapeHtml(b.id)}">
            👁️ Xem ${total} bài viết
          </button>
          <a href="/api/export.xlsx?batchId=${escapeHtml(b.id)}" class="btn btn-sm btn-excel" download>
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

btnRefreshBatches.addEventListener('click', fetchBatches);

filterBatchSelect.addEventListener('change', (e) => {
  state.batchId = e.target.value;
  state.page = 1;
  updateExportLinks();
  fetchPosts();
});

/**
 * Lấy số liệu thống kê tổng thể
 */
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    statTotalPosts.textContent = (data.totalPosts || 0).toLocaleString();
    statFound.textContent = (data.found || 0).toLocaleString();
    statPending.textContent = (data.pending || 0).toLocaleString();
    statErrors.textContent = (data.errors || 0).toLocaleString();
    statPublishersCount.textContent = (data.publisherCount || 0).toLocaleString();

    tabPostsCount.textContent = data.totalPosts || 0;
    tabPubsCount.textContent = data.publisherCount || 0;

    renderPublisherTable(data.publishers || []);
  } catch (err) {
    console.error('Lỗi khi tải thống kê:', err);
  }
}

/**
 * Render bảng người đăng bài (View 3 và Aside)
 */
function renderPublisherTable(publishers) {
  if (!publisherTableBody) return;
  publisherTableBody.innerHTML = '';

  if (publishers.length === 0) {
    publisherTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">Chưa có dữ liệu người đăng bài</td>
      </tr>
    `;
    return;
  }

  const medals = ['🥇 #1', '🥈 #2', '🥉 #3'];

  publishers.forEach((p, idx) => {
    const isSelected = state.publisher === p.publisher_name;
    const rankBadge = idx < 3 ? `<span style="font-weight: 700; color: #fbbf24;">${medals[idx]}</span>` : `#${idx + 1}`;

    const tr = document.createElement('tr');
    tr.className = isSelected ? 'row-selected' : '';
    tr.innerHTML = `
      <td style="text-align: center;">${rankBadge}</td>
      <td>
        <strong style="color: #fff;">${escapeHtml(p.publisher_name)}</strong>
      </td>
      <td style="text-align: right;">
        <span class="badge badge-success" style="font-size: 0.9rem; font-weight: 700;">${p.count.toLocaleString()} bài</span>
      </td>
      <td style="text-align: center;">
        <button class="btn btn-xs btn-outline btn-filter-pub">
          ${isSelected ? 'Bỏ chọn' : 'Xem bài viết'}
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
  updateExportLinks();
  fetchPosts();
}

function clearPublisherFilter() {
  state.publisher = '';
  state.page = 1;
  activeFilterNotice.style.display = 'none';
  btnClearPublisherFilter.style.display = 'none';
  updateExportLinks();
  fetchPosts();
  fetchStats();
}

btnRemovePubFilter.addEventListener('click', clearPublisherFilter);
btnClearPublisherFilter.addEventListener('click', clearPublisherFilter);

/**
 * Lấy danh sách bài viết cho View 2
 */
async function fetchPosts() {
  const sinceVal = dmyToYmd(sinceDateInput.value.trim());
  const untilVal = dmyToYmd(untilDateInput.value.trim());

  state.since = sinceVal;
  state.until = untilVal;
  updateExportLinks();

  const params = new URLSearchParams({
    page: state.page,
    limit: state.limit
  });

  if (state.batchId && state.batchId !== 'ALL') params.set('batchId', state.batchId);
  if (state.since) params.set('since', state.since);
  if (state.until) params.set('until', state.until);
  if (state.publisher) params.set('publisher', state.publisher);
  if (state.status !== 'ALL') params.set('status', state.status);
  if (state.search) params.set('search', state.search);

  postsTableBody.innerHTML = `
    <tr>
      <td colspan="6" class="empty-cell">
        <div class="spinner" style="margin: 0.5rem auto;"></div>
        Đang tải bài viết...
      </td>
    </tr>
  `;

  try {
    const res = await fetch(`/api/posts?${params.toString()}`);
    const data = await res.json();

    state.totalPages = data.totalPages || 1;
    renderPostsTable(data.items || []);
    renderPagination(data.total || 0);
  } catch (err) {
    postsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell text-danger">Lỗi khi tải bài viết: ${escapeHtml(err.message)}</td>
      </tr>
    `;
  }
}

function renderPostsTable(items) {
  postsTableBody.innerHTML = '';

  if (items.length === 0) {
    postsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell">Không tìm thấy bài viết nào phù hợp.</td>
      </tr>
    `;
    return;
  }

  items.forEach((p) => {
    const tr = document.createElement('tr');

    let statusBadge = '';
    if (p.publisher_status === 'FOUND') {
      statusBadge = `<span class="badge badge-success">FOUND</span>`;
    } else if (p.publisher_status === 'PENDING') {
      statusBadge = `<span class="badge badge-warning">PENDING</span>`;
    } else if (p.publisher_status === 'NOT_FOUND') {
      statusBadge = `<span class="badge badge-secondary">NOT_FOUND</span>`;
    } else {
      statusBadge = `<span class="badge badge-danger">${escapeHtml(p.publisher_status)}</span>`;
    }

    let publisherHtml = '<span class="text-muted">Chưa xác định</span>';
    if (p.publisher_status === 'FOUND' && p.publisher_name) {
      if (p.publisher_profile_url) {
        publisherHtml = `<a href="${escapeHtml(p.publisher_profile_url)}" target="_blank" class="publisher-link" title="Xem trang cá nhân">${escapeHtml(p.publisher_name)}</a>`;
      } else {
        publisherHtml = `<strong class="text-success">${escapeHtml(p.publisher_name)}</strong>`;
      }
    }

    const formattedDate = formatVnDateDisplay(p.created_time);
    const messagePreview = p.message ? escapeHtml(truncateText(p.message, 120)) : '<em class="text-dim">Không có nội dung chữ</em>';

    tr.innerHTML = `
      <td style="white-space: nowrap; font-size: 0.85rem; color: var(--text-dim);">${formattedDate}</td>
      <td>${publisherHtml}</td>
      <td title="${escapeHtml(p.message || '')}">${messagePreview}</td>
      <td style="text-align: center; white-space: nowrap;">
        <span class="interaction-pill" title="Lượt thích">❤️ ${p.likes_count || 0}</span>
        <span class="interaction-pill" title="Bình luận">💬 ${p.comments_count || 0}</span>
        <span class="interaction-pill" title="Chia sẻ">🔁 ${p.shares_count || 0}</span>
      </td>
      <td style="text-align: center;">${statusBadge}</td>
      <td style="text-align: center;">
        <a href="${escapeHtml(p.permalink_url)}" target="_blank" class="btn btn-xs btn-outline" title="Mở trên Facebook">🔗</a>
      </td>
    `;

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

filterSearch.addEventListener('input', debounce(() => {
  state.search = filterSearch.value.trim();
  state.page = 1;
  updateExportLinks();
  fetchPosts();
}, 400));

filterStatus.addEventListener('change', (e) => {
  state.status = e.target.value;
  state.page = 1;
  updateExportLinks();
  fetchPosts();
});

btnRefreshList.addEventListener('click', () => {
  fetchPosts();
  fetchStats();
});

/**
 * Action: Đồng bộ bài viết từ Graph API
 */
btnSyncPosts.addEventListener('click', async () => {
  const sinceVal = sinceDateInput.value.trim();
  const untilVal = untilDateInput.value.trim();

  if (!sinceVal || !untilVal) {
    alert('Vui lòng chọn từ ngày và đến ngày (dd/mm/yyyy).');
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
        alert(
          `⚠️ TOKEN FACEBOOK ĐÃ HẾT HẠN HOẶC KHÔNG ĐÚNG QUYỀN!\n\n` +
          `Lý do: Token cần là Page Access Token hoặc User Token của tài khoản quản trị.\n\n` +
          `Cửa sổ "Cài đặt Fanpage & Token" sẽ mở ra để bạn nhập/cập nhật token mới.`
        );
        openSettingsModal();
      } else {
        alert(`Lỗi: ${errMsg || 'Không thể đồng bộ bài viết'}`);
      }
    } else {
      alert(`✅ ${data.message}`);
      fetchStats();
      fetchBatches();
      // Chuyển về tab batches để người dùng thấy ngay đợt vừa đồng bộ
      switchTab('batches');
    }
  } catch (err) {
    alert(`Lỗi mạng: ${err.message}`);
  } finally {
    btnSyncPosts.disabled = false;
    btnSyncPosts.innerHTML = `
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
      Đồng bộ bài viết
    `;
  }
});

/**
 * Action: Lấy người đăng bài qua Playwright
 */
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
      alert(`Lỗi: ${data.error || 'Không thể bắt đầu lấy người đăng'}`);
    } else {
      startJobPolling();
    }
  } catch (err) {
    alert(`Lỗi kết nối: ${err.message}`);
  }
});

/**
 * Action: Đồng bộ tất cả (API + Playwright)
 */
btnSyncAll.addEventListener('click', async () => {
  const sinceVal = sinceDateInput.value.trim();
  const untilVal = untilDateInput.value.trim();

  if (!sinceVal || !untilVal) {
    alert('Vui lòng chọn từ ngày và đến ngày (dd/mm/yyyy).');
    return;
  }

  const force = forceRecheckCheckbox.checked;

  btnSyncAll.disabled = true;
  btnSyncAll.innerHTML = '<span class="spinner-sm"></span> Đang chạy...';

  try {
    const res = await fetch('/api/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since: sinceVal, until: untilVal, force })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      alert(`Lỗi: ${data.error || 'Không thể khởi chạy quy trình'}`);
    } else {
      alert('✅ ' + data.message);
      fetchStats();
      fetchBatches();
      startJobPolling();
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  } finally {
    btnSyncAll.disabled = false;
    btnSyncAll.innerHTML = `
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
      Đồng bộ tất cả
    `;
  }
});

/**
 * Quản lý polling tiến trình quét Chromium
 */
function startJobPolling() {
  if (state.pollingInterval) return;
  state.isJobRunning = true;
  progressSection.style.display = 'block';

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

        progFound.textContent = status.found || 0;
        progNotFound.textContent = status.notFound || 0;
        progErrors.textContent = status.errors || 0;
      } else {
        stopJobPolling();
        progressSection.style.display = 'none';
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
  } catch (e) {}
});

/**
 * Quản lý Modal Cài đặt Fanpage & Token (Lưu vào .env)
 */
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

btnSaveSettings.addEventListener('click', async () => {
  const pageId = settingPageId.value.trim();
  const token = settingAccessToken.value.trim();

  if (!pageId) {
    alert('Vui lòng nhập ID Fanpage.');
    settingPageId.focus();
    return;
  }

  if (!token) {
    alert('Vui lòng dán Facebook Access Token.');
    settingAccessToken.focus();
    return;
  }

  btnSaveSettings.disabled = true;
  saveSettingsSpinner.style.display = 'inline-block';
  settingResultBox.style.display = 'block';
  settingResultBox.innerHTML = '<em>Đang kiểm tra và liên kết với Facebook...</em>';

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, accessToken: token })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      settingResultBox.innerHTML = `<div style="color: var(--danger); font-weight: 600;">❌ ${escapeHtml(data.error || 'Lỗi lưu cấu hình')}</div>`;
    } else {
      settingResultBox.innerHTML = `
        <div style="color: var(--success); font-weight: 600; font-size: 0.95rem;">✅ ${escapeHtml(data.message)}</div>
        <div style="margin-top: 0.4rem; color: var(--text-muted); font-size: 0.85rem;">
          Đã lưu vào file <code>.env</code>. Hệ thống sẽ duy trì cấu hình này ngay cả khi khởi động lại server.
        </div>
      `;
      checkConfigStatus();
    }
  } catch (err) {
    settingResultBox.innerHTML = `<div style="color: var(--danger);">❌ Lỗi kết nối: ${escapeHtml(err.message)}</div>`;
  } finally {
    btnSaveSettings.disabled = false;
    saveSettingsSpinner.style.display = 'none';
  }
});

/**
 * Quản lý Modal Test 1 bài viết
 */
btnOpenTestModal.addEventListener('click', () => {
  testPostModal.style.display = 'flex';
  testResultBox.style.display = 'none';
  testResultBox.innerHTML = '';
});

function closeTestModal() {
  testPostModal.style.display = 'none';
}

btnCloseModal.addEventListener('click', closeTestModal);
btnCancelModal.addEventListener('click', closeTestModal);

btnRunTestPost.addEventListener('click', async () => {
  const url = testPostUrl.value.trim();
  if (!url) {
    alert('Vui lòng nhập URL bài viết Facebook.');
    return;
  }

  btnRunTestPost.disabled = true;
  testSpinner.style.display = 'inline-block';
  testResultBox.style.display = 'block';
  testResultBox.innerHTML = '<em>Đang mở Chromium và kiểm tra bài viết... Hãy chờ trong giây lát.</em>';

  try {
    const res = await fetch('/api/test-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (data.status === 'FOUND') {
      testResultBox.innerHTML = `
        <div style="color: var(--success); font-weight: 600; margin-bottom: 0.5rem;">✅ Trích xuất thành công!</div>
        <div><strong>Người đăng:</strong> ${escapeHtml(data.name)}</div>
        <div><strong>Publisher ID:</strong> ${data.id || 'N/A'}</div>
        <div><strong>Profile URL:</strong> ${data.profileUrl ? `<a href="${data.profileUrl}" target="_blank" class="publisher-link">${data.profileUrl}</a>` : 'N/A'}</div>
        <div><strong>Phương thức:</strong> <code>${data.method}</code></div>
        <div><strong>Văn bản gốc:</strong> "${escapeHtml(data.rawText || '')}"</div>
      `;
    } else {
      testResultBox.innerHTML = `
        <div style="color: var(--warning); font-weight: 600; margin-bottom: 0.5rem;">⚠️ Trạng thái: ${data.status}</div>
        <div><strong>Lý do:</strong> ${escapeHtml(data.reason || 'Không tìm thấy thông tin người đăng')}</div>
        ${data.debugPath ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">Debug folder: <code>${escapeHtml(data.debugPath)}</code></div>` : ''}
      `;
    }
  } catch (err) {
    testResultBox.innerHTML = `<div style="color: var(--danger);">Lỗi khi kiểm tra: ${err.message}</div>`;
  } finally {
    btnRunTestPost.disabled = false;
    testSpinner.style.display = 'none';
  }
});

// Utilities
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

// Khởi chạy ban đầu khi trang load
window.addEventListener('DOMContentLoaded', () => {
  initDefaultDates();
  checkConfigStatus();
  fetchStats();
  fetchBatches(); // Tải danh sách các đợt đồng bộ bài viết (Mặc định không hiển thị bài viết dàn trải)

  fetch('/api/status').then(r => r.json()).then(j => {
    if (j.isRunning) startJobPolling();
  }).catch(() => {});
});
