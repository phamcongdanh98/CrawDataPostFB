// State quản lý ứng dụng client
const state = {
  since: '', // Định dạng YYYY-MM-DD dùng cho API
  until: '', // Định dạng YYYY-MM-DD dùng cho API
  publisher: '',
  status: 'ALL',
  search: '',
  page: 1,
  limit: 20,
  totalPages: 1,
  isJobRunning: false,
  pollingInterval: null
};

// DOM Elements
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

const progressSection = document.getElementById('progressSection');
const progressBarFill = document.getElementById('progressBarFill');
const progressCountText = document.getElementById('progressCountText');
const progressCurrentMsg = document.getElementById('progressCurrentMsg');
const progressCurrentPub = document.getElementById('progressCurrentPub');
const progFound = document.getElementById('progFound');
const progNotFound = document.getElementById('progNotFound');
const progErrors = document.getElementById('progErrors');
const btnStopJob = document.getElementById('btnStopJob');

const statTotalPosts = document.getElementById('statTotalPosts');
const statFound = document.getElementById('statFound');
const statPending = document.getElementById('statPending');
const statErrors = document.getElementById('statErrors');
const statPublishersCount = document.getElementById('statPublishersCount');

const publisherTableBody = document.getElementById('publisherTableBody');
const btnClearPublisherFilter = document.getElementById('btnClearPublisherFilter');
const activeFilterNotice = document.getElementById('activeFilterNotice');
const currentFilterPublisherName = document.getElementById('currentFilterPublisherName');
const btnRemovePubFilter = document.getElementById('btnRemovePubFilter');

const postsTableBody = document.getElementById('postsTableBody');
const filterSearch = document.getElementById('filterSearch');
const filterStatus = document.getElementById('filterStatus');
const btnRefreshList = document.getElementById('btnRefreshList');

const pageRangeText = document.getElementById('pageRangeText');
const pageTotalText = document.getElementById('pageTotalText');
const currentPageText = document.getElementById('currentPageText');
const btnPrevPage = document.getElementById('btnPrevPage');
const btnNextPage = document.getElementById('btnNextPage');

// Modal Elements
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
 * Tự động format dd/mm/yyyy khi gõ
 */
function applyDateMask(input) {
  input.addEventListener('input', (e) => {
    let val = input.value.replace(/\D/g, '');
    if (val.length > 8) val = val.substring(0, 8);
    let formatted = '';
    if (val.length > 4) {
      formatted = `${val.substring(0, 2)}/${val.substring(2, 4)}/${val.substring(4)}`;
    } else if (val.length > 2) {
      formatted = `${val.substring(0, 2)}/${val.substring(2)}`;
    } else {
      formatted = val;
    }
    input.value = formatted;
  });
}

/**
 * Khởi tạo ngày mặc định chuẩn dd/mm/yyyy (60 ngày trước đến hôm nay)
 */
function initDefaultDates() {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - 60);

  const sinceDmy = dateToDmy(past);
  const untilDmy = dateToDmy(today);

  sinceDateInput.value = sinceDmy;
  untilDateInput.value = untilDmy;

  sinceDatePicker.value = dateToYmd(past);
  untilDatePicker.value = dateToYmd(today);

  state.since = dateToYmd(past);
  state.until = dateToYmd(today);

  applyDateMask(sinceDateInput);
  applyDateMask(untilDateInput);

  // Đồng bộ picker sang text
  btnSinceCalendar.addEventListener('click', () => {
    try { sinceDatePicker.showPicker(); } catch (e) { sinceDatePicker.click(); }
  });
  sinceDatePicker.addEventListener('change', () => {
    if (sinceDatePicker.value) {
      sinceDateInput.value = ymdToDmy(sinceDatePicker.value);
      state.since = sinceDatePicker.value;
      state.page = 1;
      updateExportLink();
      fetchPosts();
    }
  });

  btnUntilCalendar.addEventListener('click', () => {
    try { untilDatePicker.showPicker(); } catch (e) { untilDatePicker.click(); }
  });
  untilDatePicker.addEventListener('change', () => {
    if (untilDatePicker.value) {
      untilDateInput.value = ymdToDmy(untilDatePicker.value);
      state.until = untilDatePicker.value;
      state.page = 1;
      updateExportLink();
      fetchPosts();
    }
  });

  updateExportLink();
}

/**
 * Cập nhật đường link xuất Excel và CSV theo bộ lọc hiện tại
 */
function updateExportLink() {
  const params = new URLSearchParams();
  if (state.since) params.set('since', state.since);
  if (state.until) params.set('until', state.until);
  if (state.publisher) params.set('publisher', state.publisher);
  if (state.status && state.status !== 'ALL') params.set('status', state.status);
  if (state.search) params.set('search', state.search);

  btnExportCsv.href = `/api/export.csv?${params.toString()}`;
  if (btnExportExcel) {
    btnExportExcel.href = `/api/export.xlsx?${params.toString()}`;
  }
}

/**
 * Kiểm tra trạng thái cấu hình hệ thống
 */
async function checkConfigStatus() {
  try {
    const res = await fetch('/api/config-status');
    const data = await res.json();
    const bannersContainer = document.getElementById('statusBanners');
    bannersContainer.innerHTML = '';

    if (!data.isApiConfigured) {
      const banner = document.createElement('div');
      banner.className = 'banner banner-warning';
      banner.innerHTML = `
        <strong>⚠️ Chưa cấu hình API:</strong> Bạn chưa nhập <code>FB_PAGE_ID</code> và <code>FB_PAGE_ACCESS_TOKEN</code> trong file <code>.env</code>. Vui lòng cập nhật để sử dụng tính năng đồng bộ bài viết.
      `;
      bannersContainer.appendChild(banner);
    }

    if (!data.isProfilePresent) {
      const banner = document.createElement('div');
      banner.className = 'banner banner-info';
      banner.innerHTML = `
        <strong>ℹ️ Chưa có phiên đăng nhập:</strong> Hãy mở Terminal và chạy lệnh <code>npm run login</code> để đăng nhập tài khoản Facebook quản trị và chuyển sang tư cách Fanpage.
      `;
      bannersContainer.appendChild(banner);
    }
  } catch (err) {
    console.error('Lỗi khi kiểm tra cấu hình:', err);
  }
}

/**
 * Lấy dữ liệu thống kê tổng quan
 */
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    statTotalPosts.textContent = data.totalPosts.toLocaleString('vi-VN');
    statFound.textContent = data.found.toLocaleString('vi-VN');
    statPending.textContent = data.pending.toLocaleString('vi-VN');
    statErrors.textContent = data.errors.toLocaleString('vi-VN');
    statPublishersCount.textContent = data.publisherCount.toLocaleString('vi-VN');

    renderPublisherTable(data.publishers || []);
  } catch (err) {
    console.error('Lỗi khi lấy stats:', err);
  }
}

/**
 * Hiển thị bảng danh sách người đăng
 */
function renderPublisherTable(publishers) {
  publisherTableBody.innerHTML = '';

  if (publishers.length === 0) {
    publisherTableBody.innerHTML = `<tr><td colspan="2" class="empty-cell">Chưa có dữ liệu người đăng</td></tr>`;
    return;
  }

  publishers.forEach((pub) => {
    const tr = document.createElement('tr');
    tr.className = `clickable-row ${state.publisher === pub.publisher_name ? 'selected' : ''}`;
    tr.title = `Bấm để lọc bài viết của ${pub.publisher_name}`;
    tr.innerHTML = `
      <td><strong>${escapeHtml(pub.publisher_name)}</strong></td>
      <td style="text-align: right;"><span class="badge badge-info">${pub.count}</span></td>
    `;

    tr.addEventListener('click', () => {
      setPublisherFilter(pub.publisher_name);
    });

    publisherTableBody.appendChild(tr);
  });
}

function setPublisherFilter(name) {
  if (state.publisher === name) {
    clearPublisherFilter();
    return;
  }

  state.publisher = name;
  state.page = 1;
  currentFilterPublisherName.textContent = name;
  activeFilterNotice.style.display = 'flex';
  btnClearPublisherFilter.style.display = 'inline-block';

  updateExportLink();
  fetchStats();
  fetchPosts();
}

function clearPublisherFilter() {
  state.publisher = '';
  state.page = 1;
  activeFilterNotice.style.display = 'none';
  btnClearPublisherFilter.style.display = 'none';

  updateExportLink();
  fetchStats();
  fetchPosts();
}

/**
 * Lấy danh sách bài viết
 */
async function fetchPosts() {
  const params = new URLSearchParams({
    page: state.page,
    limit: state.limit,
    since: state.since,
    until: state.until
  });

  if (state.publisher) params.set('publisher', state.publisher);
  if (state.status && state.status !== 'ALL') params.set('status', state.status);
  if (state.search) params.set('search', state.search);

  try {
    const res = await fetch(`/api/posts?${params.toString()}`);
    const data = await res.json();

    state.totalPages = data.totalPages || 1;
    renderPostsTable(data.items || []);
    updatePagination(data);
  } catch (err) {
    console.error('Lỗi khi lấy posts:', err);
  }
}

/**
 * Render bảng bài viết kèm tương tác và ngày định dạng dd/mm/yyyy
 */
function renderPostsTable(posts) {
  postsTableBody.innerHTML = '';

  if (posts.length === 0) {
    postsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell">Chưa có bài viết nào trong khoảng thời gian hoặc điều kiện lọc này.</td>
      </tr>
    `;
    return;
  }

  posts.forEach((p) => {
    const tr = document.createElement('tr');

    // Format ngày giờ Việt Nam chuẩn dd/mm/yyyy HH:mm:ss
    const formattedDate = formatDateTimeVN(p.created_time);

    // Trạng thái badge
    const badge = getStatusBadge(p.publisher_status);

    // Người đăng link hoặc text
    let publisherDisplay = '<span class="text-dim">-</span>';
    if (p.publisher_name) {
      if (p.publisher_profile_url) {
        publisherDisplay = `<a href="${p.publisher_profile_url}" target="_blank" class="publisher-link">${escapeHtml(p.publisher_name)} ↗</a>`;
      } else {
        publisherDisplay = `<strong>${escapeHtml(p.publisher_name)}</strong>`;
      }
    }

    const previewMsg = p.message ? escapeHtml(p.message) : '<em class="text-dim">(Không có nội dung văn bản)</em>';

    // Badge tương tác
    const likesCount = p.likes_count || 0;
    const commentsCount = p.comments_count || 0;
    const sharesCount = p.shares_count || 0;

    tr.innerHTML = `
      <td style="white-space: nowrap; font-size: 0.8rem; color: var(--text-muted);">${formattedDate}</td>
      <td>${publisherDisplay}</td>
      <td><div class="post-preview-text" title="${escapeHtml(p.message || '')}">${previewMsg}</div></td>
      <td style="text-align: center;">
        <div class="interactions-cell">
          <span class="stat-pill pill-like" title="Lượt thích / cảm xúc">👍 ${likesCount}</span>
          <span class="stat-pill pill-comment" title="Bình luận">💬 ${commentsCount}</span>
          <span class="stat-pill pill-share" title="Chia sẻ">🔄 ${sharesCount}</span>
        </div>
      </td>
      <td style="text-align: center;">${badge}</td>
      <td style="text-align: center;">
        <a href="${p.permalink_url}" target="_blank" class="post-link" title="Mở trên Facebook">Mở ↗</a>
      </td>
    `;

    postsTableBody.appendChild(tr);
  });
}

function getStatusBadge(status) {
  switch (status) {
    case 'FOUND':
      return '<span class="badge badge-success">Đã xác định</span>';
    case 'PENDING':
      return '<span class="badge badge-warning">Chờ xử lý</span>';
    case 'NOT_FOUND':
      return '<span class="badge badge-secondary">Không tìm thấy</span>';
    case 'LOGIN_REQUIRED':
      return '<span class="badge badge-danger">Cần đăng nhập</span>';
    case 'POST_UNAVAILABLE':
      return '<span class="badge badge-danger">Không khả dụng</span>';
    case 'ERROR':
    default:
      return '<span class="badge badge-danger">Lỗi</span>';
  }
}

/**
 * Format ngày giờ Việt Nam chuẩn dd/mm/yyyy HH:mm:ss
 */
function formatDateTimeVN(utcStr) {
  if (!utcStr) return '-';
  try {
    const d = new Date(utcStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hour}:${min}:${sec}`;
  } catch (e) {
    return utcStr;
  }
}

function updatePagination(data) {
  const { total, page, limit, totalPages } = data;

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  pageRangeText.textContent = `${start} - ${end}`;
  pageTotalText.textContent = total.toLocaleString('vi-VN');
  currentPageText.textContent = `Trang ${page} / ${totalPages}`;

  btnPrevPage.disabled = page <= 1;
  btnNextPage.disabled = page >= totalPages;
}

/**
 * Polling tiến độ worker mỗi 1 giây
 */
function startJobPolling() {
  if (state.pollingInterval) return;

  progressSection.style.display = 'block';

  state.pollingInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const job = await res.json();

      if (job.isRunning) {
        state.isJobRunning = true;
        const percent = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
        progressBarFill.style.width = `${percent}%`;
        progressCountText.textContent = `${job.processed} / ${job.total} (${percent}%)`;
        progressCurrentMsg.textContent = job.currentPostMessage || '-';
        progressCurrentPub.textContent = job.currentPublisher || '-';
        progFound.textContent = job.found;
        progNotFound.textContent = job.notFound;
        progErrors.textContent = job.errors;
      } else {
        clearInterval(state.pollingInterval);
        state.pollingInterval = null;
        state.isJobRunning = false;

        if (job.error) {
          alert(`Thông báo tiến trình: ${job.error}`);
        }

        fetchStats();
        fetchPosts();

        setTimeout(() => {
          progressSection.style.display = 'none';
        }, 3000);
      }
    } catch (err) {
      console.warn('Lỗi khi polling trạng thái job:', err);
    }
  }, 1000);
}

/**
 * Event Listeners
 */
sinceDateInput.addEventListener('change', () => {
  const ymd = dmyToYmd(sinceDateInput.value);
  if (ymd) {
    state.since = ymd;
    sinceDatePicker.value = ymd;
    state.page = 1;
    updateExportLink();
    fetchPosts();
  }
});

untilDateInput.addEventListener('change', () => {
  const ymd = dmyToYmd(untilDateInput.value);
  if (ymd) {
    state.until = ymd;
    untilDatePicker.value = ymd;
    state.page = 1;
    updateExportLink();
    fetchPosts();
  }
});

filterStatus.addEventListener('change', () => {
  state.status = filterStatus.value;
  state.page = 1;
  updateExportLink();
  fetchPosts();
});

let searchTimeout = null;
filterSearch.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.search = filterSearch.value.trim();
    state.page = 1;
    updateExportLink();
    fetchPosts();
  }, 400);
});

btnRefreshList.addEventListener('click', () => {
  fetchStats();
  fetchPosts();
});

btnClearPublisherFilter.addEventListener('click', clearPublisherFilter);
btnRemovePubFilter.addEventListener('click', clearPublisherFilter);

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

// Action: Đồng bộ bài viết từ Graph API
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
      alert(`Lỗi: ${data.error || 'Không thể đồng bộ bài viết'}`);
    } else {
      alert(`✅ ${data.message}`);
      fetchStats();
      fetchPosts();
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

// Action: Lấy người đăng
btnDetectPublishers.addEventListener('click', async () => {
  const force = forceRecheckCheckbox.checked;

  try {
    const res = await fetch('/api/detect-publishers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force })
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

// Action: Đồng bộ tất cả
btnSyncAll.addEventListener('click', async () => {
  const sinceVal = sinceDateInput.value.trim();
  const untilVal = untilDateInput.value.trim();

  if (!sinceVal || !untilVal) {
    alert('Vui lòng chọn từ ngày và đến ngày (dd/mm/yyyy).');
    return;
  }

  const force = forceRecheckCheckbox.checked;

  btnSyncAll.disabled = true;
  btnSyncAll.innerHTML = '<span class="spinner-sm"></span> Đang khởi chạy...';

  try {
    const res = await fetch('/api/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since: sinceVal, until: untilVal, force })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      alert(`Lỗi: ${data.error || 'Không thể đồng bộ tất cả'}`);
    } else {
      alert(`✅ ${data.message}`);
      fetchStats();
      fetchPosts();
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

// Action: Dừng Job
btnStopJob.addEventListener('click', async () => {
  try {
    await fetch('/api/stop-job', { method: 'POST' });
    btnStopJob.textContent = 'Đang dừng...';
  } catch (e) {}
});

// Modal Test nhanh 1 bài
btnOpenTestModal.addEventListener('click', () => {
  testPostModal.style.display = 'flex';
  testResultBox.style.display = 'none';
  testResultBox.innerHTML = '';
});

function closeModal() {
  testPostModal.style.display = 'none';
}

btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Khởi chạy ban đầu
window.addEventListener('DOMContentLoaded', () => {
  initDefaultDates();
  checkConfigStatus();
  fetchStats();
  fetchPosts();

  fetch('/api/status').then(r => r.json()).then(j => {
    if (j.isRunning) startJobPolling();
  }).catch(() => {});
});
