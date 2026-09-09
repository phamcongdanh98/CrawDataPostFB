const config = require('./config');
const db = require('./db');
const { fetchPagePosts } = require('./graph-api');
const { runPublisherWorker, getJobState, stopJob } = require('./publisher-worker');
const { isDateRangeValid } = require('./utils');

/**
 * Đồng bộ bài viết từ Meta Graph API vào SQLite
 */
async function syncPosts(since, until, options = {}) {
  if (!since || !until) {
    throw new Error('Vui lòng cung cấp cả ngày bắt đầu (since) và ngày kết thúc (until) theo định dạng YYYY-MM-DD');
  }

  if (!isDateRangeValid(since, until)) {
    throw new Error('Khoảng ngày không hợp lệ. Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc (YYYY-MM-DD).');
  }

  console.log(`[SyncService] Bắt đầu đồng bộ Graph API từ ${since} đến ${until}...`);
  const posts = await fetchPagePosts(since, until, options);

  if (posts.length === 0) {
    console.log('[SyncService] Không có bài viết nào trong khoảng thời gian này.');
    return { total: 0, insertedCount: 0, updatedCount: 0 };
  }

  const batchId = `batch_${Date.now()}`;
  const batchName = `Đợt ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày ${new Date().toLocaleDateString('vi-VN')}`;

  const result = db.upsertPosts(posts, batchId);
  db.createSyncBatch({
    id: batchId,
    batch_name: batchName,
    since_date: since,
    until_date: until,
    total_posts: posts.length,
    inserted_posts: result.insertedCount,
    updated_posts: result.updatedCount,
    note: `Lấy ${posts.length} bài viết từ ${since} đến ${until}`
  });

  console.log(`[SyncService] Lưu DB thành công đợt ${batchId}: Thêm mới ${result.insertedCount} bài, Cập nhật ${result.updatedCount} bài.`);
  return { ...result, batchId, batchName };
}

/**
 * Khởi chạy tiến trình tìm người đăng bài bằng Playwright
 */
async function detectPublishers(options = {}) {
  return await runPublisherWorker(options);
}

/**
 * Thực hiện toàn bộ quy trình: Lấy Graph API -> Lưu SQLite -> Crawl Publisher
 */
async function syncAll(since, until, options = {}) {
  console.log(`[SyncService] === BẮT ĐẦU ĐỒNG BỘ TOÀN BỘ (${since} -> ${until}) ===`);

  // Bước 1: Lấy bài viết từ Graph API
  const syncResult = await syncPosts(since, until, options);

  // Bước 2: Duyệt tìm người đăng cho các bài mới lấy thuộc đợt này
  const detectResult = await detectPublishers({
    ...options,
    batchId: syncResult.batchId,
    since,
    until
  });

  return {
    syncResult,
    detectResult
  };
}

module.exports = {
  syncPosts,
  detectPublishers,
  syncAll,
  getJobState,
  stopJob
};
