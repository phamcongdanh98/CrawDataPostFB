const Database = require('better-sqlite3');
const config = require('./config');
const { normalizeDateStr, getCanonicalPostUrl } = require('./utils');
const { PUBLISHER_STATUS, POST_TYPE, SORT_COLUMNS } = require('./constants');

let dbInstance = null;

/**
 * Lấy hoặc khởi tạo instance kết nối SQLite
 */
function getDb() {
  if (!dbInstance) {
    dbInstance = new Database(config.DB_PATH);
    // Tối ưu hóa SQLite cho tốc độ và an toàn cao
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('synchronous = NORMAL');
    dbInstance.pragma('temp_store = MEMORY');
    dbInstance.pragma('cache_size = -64000'); // 64MB RAM page cache
    dbInstance.pragma('mmap_size = 268435456'); // 256MB memory map
    initSchema(dbInstance);
  }
  return dbInstance;
}

/**
 * Khởi tạo schema bảng và các index
 */
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      message TEXT,
      created_time TEXT NOT NULL,
      permalink_url TEXT NOT NULL,
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      shares_count INTEGER DEFAULT 0,
      post_type TEXT NOT NULL DEFAULT 'ORIGINAL',
      publisher_id TEXT,
      publisher_name TEXT,
      publisher_profile_url TEXT,
      publisher_raw_text TEXT,
      publisher_status TEXT NOT NULL DEFAULT 'PENDING',
      publisher_method TEXT,
      publisher_checked_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_posts_created_time ON posts(created_time);
    CREATE INDEX IF NOT EXISTS idx_posts_publisher_name ON posts(publisher_name);
    CREATE INDEX IF NOT EXISTS idx_posts_publisher_status ON posts(publisher_status);
    CREATE INDEX IF NOT EXISTS idx_posts_page_id ON posts(page_id);

    CREATE TABLE IF NOT EXISTS sync_batches (
      id TEXT PRIMARY KEY,
      batch_name TEXT,
      synced_at TEXT NOT NULL,
      since_date TEXT NOT NULL,
      until_date TEXT NOT NULL,
      total_posts INTEGER DEFAULT 0,
      inserted_posts INTEGER DEFAULT 0,
      updated_posts INTEGER DEFAULT 0,
      note TEXT
    );
  `);

  // Tự động bổ sung cột nếu bảng đã được tạo từ trước
  try { db.exec(`ALTER TABLE posts ADD COLUMN likes_count INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE posts ADD COLUMN comments_count INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE posts ADD COLUMN shares_count INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE posts ADD COLUMN post_type TEXT DEFAULT 'ORIGINAL';`); } catch (e) {}
  try { db.exec(`ALTER TABLE posts ADD COLUMN sync_batch_id TEXT;`); } catch (e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type);`); } catch (e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_sync_batch ON posts(sync_batch_id);`); } catch (e) {}
  // Composite indexes để tăng tốc tối đa việc lọc và thống kê nhiều điều kiện
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_filter ON posts(sync_batch_id, publisher_status, post_type);`); } catch (e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_time_filter ON posts(created_time, publisher_status);`); } catch (e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_status_time ON posts(publisher_status, created_time DESC);`); } catch (e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_batch_time ON posts(sync_batch_id, created_time DESC);`); } catch (e) {}

  // Gán đợt ban đầu cho các bài viết cũ chưa có sync_batch_id
  try {
    const nullBatchRow = db.prepare(`SELECT COUNT(*) as c FROM posts WHERE sync_batch_id IS NULL`).get();
    if (nullBatchRow && nullBatchRow.c > 0) {
      const initBatchId = 'batch_init';
      const hasBatch = db.prepare(`SELECT id FROM sync_batches WHERE id = ?`).get(initBatchId);
      if (!hasBatch) {
        db.prepare(`
          INSERT INTO sync_batches (id, batch_name, synced_at, since_date, until_date, total_posts, inserted_posts, updated_posts, note)
          VALUES (?, ?, datetime('now', 'localtime'), ?, ?, ?, ?, 0, ?)
        `).run(
          initBatchId,
          'Đợt đồng bộ trước đây',
          '01/07/2026',
          '09/09/2026',
          nullBatchRow.c,
          nullBatchRow.c,
          'Dữ liệu đã đồng bộ trong hệ thống'
        );
      }
      db.prepare(`UPDATE posts SET sync_batch_id = ? WHERE sync_batch_id IS NULL`).run(initBatchId);
    }
  } catch (e) {
    console.warn('[DB] Lỗi khởi tạo migration sync_batch_id:', e.message);
  }

  // Tự động chuẩn hóa permalink_url cho tất cả bài viết sang URL Canonical
  // Khắc phục triệt để lỗi 404 khi Facebook trả về App-Scoped Page ID dạng /122190944702946007/
  try {
    db.prepare(`
      UPDATE posts
      SET permalink_url = 'https://www.facebook.com/permalink.php?story_fbid=' || SUBSTR(id, INSTR(id, '_') + 1) || '&id=' || page_id
      WHERE id LIKE '%_%' AND (permalink_url LIKE '%/122190944702946007/%' OR permalink_url NOT LIKE '%permalink.php%');
    `).run();
  } catch (e) {
    console.warn('[DB] Lỗi migration permalink_url:', e.message);
  }
}

/**
 * Thêm mới hoặc cập nhật bài viết từ Meta Graph API
 * Không ghi đè thông tin publisher nếu bài đã FOUND
 */
function upsertPost(dbOrPost, postOrBatchId, maybeBatchId = null) {
  let db, post, batchId;
  if (dbOrPost && typeof dbOrPost.prepare === 'function') {
    db = dbOrPost;
    post = postOrBatchId;
    batchId = maybeBatchId;
  } else {
    db = getDb();
    post = dbOrPost;
    batchId = postOrBatchId;
  }
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT id, publisher_status, sync_batch_id FROM posts WHERE id = ?`).get(post.id);

  const likes = post.likes_count ?? 0;
  const comments = post.comments_count ?? 0;
  const shares = post.shares_count ?? 0;
  const postType = post.post_type || 'ORIGINAL';
  const canonicalUrl = getCanonicalPostUrl(post, post.page_id) || post.permalink_url;
  const targetBatchId = batchId || (existing ? existing.sync_batch_id : null);

  if (!existing) {
    // Insert mới hoàn toàn
    const stmt = db.prepare(`
      INSERT INTO posts (
        id, page_id, message, created_time, permalink_url,
        likes_count, comments_count, shares_count, post_type,
        publisher_status, attempt_count, sync_batch_id, created_at, updated_at
      ) VALUES (
        @id, @page_id, @message, @created_time, @permalink_url,
        @likes, @comments, @shares, @postType,
        'PENDING', 0, @targetBatchId, @now, @now
      )
    `);
    stmt.run({
      id: post.id,
      page_id: post.page_id,
      message: post.message || '',
      created_time: post.created_time,
      permalink_url: canonicalUrl,
      likes,
      comments,
      shares,
      postType,
      targetBatchId,
      now
    });
    return { inserted: true, updated: false };
  } else {
    // Cập nhật thông tin bài viết từ Graph API, giữ nguyên publisher nếu đã FOUND
    const stmt = db.prepare(`
      UPDATE posts SET
        message = @message,
        created_time = @created_time,
        permalink_url = @permalink_url,
        likes_count = CASE WHEN @likes > 0 THEN @likes WHEN likes_count > 0 THEN likes_count ELSE @likes END,
        comments_count = CASE WHEN @comments > 0 THEN @comments WHEN comments_count > 0 THEN comments_count ELSE @comments END,
        shares_count = CASE WHEN @shares > 0 THEN @shares WHEN shares_count > 0 THEN shares_count ELSE @shares END,
        post_type = COALESCE(@postType, post_type),
        sync_batch_id = COALESCE(@targetBatchId, sync_batch_id),
        updated_at = @now
      WHERE id = @id
    `);
    stmt.run({
      id: post.id,
      message: post.message || '',
      created_time: post.created_time,
      permalink_url: canonicalUrl,
      likes,
      comments,
      shares,
      postType,
      targetBatchId,
      now
    });
    return { inserted: false, updated: true };
  }
}

/**
 * Upsert danh sách bài viết trong 1 transaction
 */
function upsertPosts(posts, batchId = null) {
  const db = getDb();
  let insertedCount = 0;
  let updatedCount = 0;

  const runTx = db.transaction((items) => {
    for (const item of items) {
      const res = upsertPost(db, item, batchId);
      if (res.inserted) insertedCount++;
      if (res.updated) updatedCount++;
    }
  });

  runTx(posts);
  return { insertedCount, updatedCount, total: posts.length };
}

/**
 * Cập nhật kết quả trích xuất publisher và tương tác cho 1 bài viết từ Playwright
 */
function updatePublisherResult(id, result) {
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE posts SET
      publisher_status = @status,
      publisher_id = COALESCE(@publisher_id, publisher_id),
      publisher_name = COALESCE(@publisher_name, publisher_name),
      publisher_profile_url = COALESCE(@publisher_profile_url, publisher_profile_url),
      publisher_raw_text = COALESCE(@publisher_raw_text, publisher_raw_text),
      publisher_method = COALESCE(@publisher_method, publisher_method),
      publisher_checked_at = @now,
      likes_count = CASE WHEN @likes IS NOT NULL AND @likes >= 0 THEN @likes ELSE likes_count END,
      comments_count = CASE WHEN @comments IS NOT NULL AND @comments >= 0 THEN @comments ELSE comments_count END,
      shares_count = CASE WHEN @shares IS NOT NULL AND @shares >= 0 THEN @shares ELSE shares_count END,
      post_type = CASE
        WHEN post_type = 'SHARED' THEN 'SHARED'
        WHEN @post_type = 'SHARED' THEN 'SHARED'
        WHEN @post_type IS NOT NULL AND @post_type != '' THEN @post_type
        ELSE post_type
      END,
      attempt_count = attempt_count + 1,
      last_error = @last_error,
      updated_at = @now
    WHERE id = @id
  `);

  stmt.run({
    id,
    status: result.status,
    publisher_id: result.id || null,
    publisher_name: result.name || null,
    publisher_profile_url: result.profileUrl || null,
    publisher_raw_text: result.rawText || null,
    publisher_method: result.method || null,
    likes: (typeof result.likes === 'number' && !isNaN(result.likes)) ? result.likes : null,
    comments: (typeof result.comments === 'number' && !isNaN(result.comments)) ? result.comments : null,
    shares: (typeof result.shares === 'number' && !isNaN(result.shares)) ? result.shares : null,
    post_type: result.postType || null,
    last_error: result.reason || result.error || null,
    now
  });
}

/**
 * Lấy danh sách bài viết chờ crawl publisher (hỗ trợ lọc theo khoảng ngày since/until hoặc đợt batchId)
 * @param {Object|number} optionsOrLimit
 * @param {boolean} legacyForce
 */
function getPendingPosts(optionsOrLimit = {}, legacyForce = false) {
  const db = getDb();
  let limit = 10000;
  let force = false;
  let since = null;
  let until = null;
  let batchId = null;

  let includeNotFound = false;

  if (typeof optionsOrLimit === 'number') {
    limit = optionsOrLimit;
    force = Boolean(legacyForce);
  } else if (typeof optionsOrLimit === 'object' && optionsOrLimit !== null) {
    limit = optionsOrLimit.limit || 10000;
    force = Boolean(optionsOrLimit.force);
    includeNotFound = Boolean(optionsOrLimit.includeNotFound);
    since = optionsOrLimit.since || null;
    until = optionsOrLimit.until || null;
    batchId = optionsOrLimit.batchId || null;
  }

  const conditions = [];
  const params = {};

  if (!force) {
    if (includeNotFound) {
      conditions.push(`(publisher_status = 'PENDING' OR publisher_status = 'NOT_FOUND')`);
    } else {
      conditions.push(`publisher_status = 'PENDING'`);
    }
  }

  if (batchId && batchId !== 'ALL') {
    conditions.push(`sync_batch_id = @batchId`);
    params.batchId = batchId;
  }

  if (since) {
    const norm = normalizeDateStr(since) || since;
    conditions.push(`created_time >= @since`);
    params.since = `${norm}T00:00:00+07:00`;
  }

  if (until) {
    const norm = normalizeDateStr(until) || until;
    conditions.push(`created_time <= @until`);
    params.until = `${norm}T23:59:59+07:00`;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.limit = limit;

  return db.prepare(`
    SELECT * FROM posts
    ${whereClause}
    ORDER BY created_time DESC
    LIMIT @limit
  `).all(params);
}

/**
 * Helper dùng chung tạo WHERE clause và parameters cho các query lọc bài viết
 */
function buildPostsFilterClause(options = {}) {
  const {
    since,
    until,
    batchId,
    publisher,
    status,
    postType,
    search,
    minLikes,
    minComments,
    minShares
  } = options;

  const conditions = [];
  const params = {};

  if (batchId && batchId !== 'ALL') {
    conditions.push(`sync_batch_id = @batchId`);
    params.batchId = batchId;
  }
  if (since) {
    const norm = normalizeDateStr(since) || since;
    conditions.push(`created_time >= @since`);
    params.since = `${norm}T00:00:00+07:00`;
  }
  if (until) {
    const norm = normalizeDateStr(until) || until;
    conditions.push(`created_time <= @until`);
    params.until = `${norm}T23:59:59+07:00`;
  }
  if (publisher) {
    conditions.push(`publisher_name = @publisher`);
    params.publisher = publisher;
  }
  if (status && status !== 'ALL') {
    conditions.push(`publisher_status = @status`);
    params.status = status;
  }
  if (postType && postType !== 'ALL') {
    conditions.push(`post_type = @postType`);
    params.postType = postType;
  }
  if (search && search.trim()) {
    conditions.push(`(message LIKE @search OR id LIKE @search OR publisher_name LIKE @search)`);
    params.search = `%${search.trim()}%`;
  }
  if (minLikes !== undefined && minLikes !== '' && !isNaN(parseInt(minLikes, 10))) {
    conditions.push(`likes_count >= @minLikes`);
    params.minLikes = parseInt(minLikes, 10);
  }
  if (minComments !== undefined && minComments !== '' && !isNaN(parseInt(minComments, 10))) {
    conditions.push(`comments_count >= @minComments`);
    params.minComments = parseInt(minComments, 10);
  }
  if (minShares !== undefined && minShares !== '' && !isNaN(parseInt(minShares, 10))) {
    conditions.push(`shares_count >= @minShares`);
    params.minShares = parseInt(minShares, 10);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, conditions, params };
}

/**
 * Lấy danh sách bài viết theo bộ lọc có phân trang
 */
function getPosts(options = {}) {
  const db = getDb();
  const {
    sortBy = 'created_time',
    sortOrder = 'DESC',
    page = 1,
    limit = 20
  } = options;

  const { whereClause, params } = buildPostsFilterClause(options);

  // Đếm tổng số bài thỏa mãn điều kiện
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM posts ${whereClause}`).get(params);
  const total = countRow ? countRow.count : 0;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const offset = (pageNum - 1) * limitNum;

  params.limit = limitNum;
  params.offset = offset;

  // Xác thực cột sắp xếp an toàn chống SQL injection
  const allowedSortColumns = {
    'created_time': 'created_time',
    'likes_count': 'likes_count',
    'comments_count': 'comments_count',
    'shares_count': 'shares_count',
    'total_engagements': '(likes_count + comments_count + shares_count)'
  };
  const sortCol = allowedSortColumns[sortBy] || 'created_time';
  const orderDir = (sortOrder && String(sortOrder).toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

  const items = db.prepare(`
    SELECT * FROM posts
    ${whereClause}
    ORDER BY ${sortCol} ${orderDir}
    LIMIT @limit OFFSET @offset
  `).all(params);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    items
  };
}

/**
 * Lấy tất cả bài viết phục vụ xuất file CSV / Excel (không phân trang)
 */
function getAllPostsForExport(options = {}) {
  const db = getDb();
  const { sortBy = 'created_time', sortOrder = 'DESC' } = options;

  const { whereClause, params } = buildPostsFilterClause(options);

  const allowedSortColumns = {
    'created_time': 'created_time',
    'likes_count': 'likes_count',
    'comments_count': 'comments_count',
    'shares_count': 'shares_count',
    'total_engagements': '(likes_count + comments_count + shares_count)'
  };
  const sortCol = allowedSortColumns[sortBy] || 'created_time';
  const orderDir = (sortOrder && String(sortOrder).toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

  return db.prepare(`
    SELECT * FROM posts
    ${whereClause}
    ORDER BY ${sortCol} ${orderDir}
  `).all(params);
}

/**
 * Tạo đợt đồng bộ mới
 */
function createSyncBatch({ id, batch_name, since_date, until_date, total_posts, inserted_posts, updated_posts, note }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sync_batches (id, batch_name, synced_at, since_date, until_date, total_posts, inserted_posts, updated_posts, note)
    VALUES (@id, @batch_name, datetime('now', 'localtime'), @since_date, @until_date, @total_posts, @inserted_posts, @updated_posts, @note)
  `);
  stmt.run({
    id,
    batch_name: batch_name || `Đợt đồng bộ ${new Date().toLocaleDateString('vi-VN')}`,
    since_date: since_date || '',
    until_date: until_date || '',
    total_posts: total_posts || 0,
    inserted_posts: inserted_posts || 0,
    updated_posts: updated_posts || 0,
    note: note || ''
  });
  return id;
}

/**
 * Lấy danh sách các đợt đồng bộ kèm thống kê tổng hợp của từng đợt
 */
function getSyncBatches() {
  const db = getDb();
  return db.prepare(`
    SELECT 
      b.id,
      b.batch_name,
      b.synced_at,
      b.since_date,
      b.until_date,
      b.total_posts,
      b.inserted_posts,
      b.updated_posts,
      b.note,
      COUNT(p.id) as actual_posts_count,
      SUM(CASE WHEN p.publisher_status = 'FOUND' THEN 1 ELSE 0 END) as found_count,
      SUM(CASE WHEN p.publisher_status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN p.publisher_status = 'NOT_FOUND' THEN 1 ELSE 0 END) as not_found_count,
      SUM(CASE WHEN p.publisher_status IN ('ERROR', 'POST_UNAVAILABLE', 'LOGIN_REQUIRED') THEN 1 ELSE 0 END) as error_count,
      COALESCE(SUM(p.likes_count), 0) as total_likes,
      COALESCE(SUM(p.comments_count), 0) as total_comments,
      COALESCE(SUM(p.shares_count), 0) as total_shares
    FROM sync_batches b
    LEFT JOIN posts p ON p.sync_batch_id = b.id
    GROUP BY b.id
    ORDER BY b.synced_at DESC
  `).all();
}

/**
 * Lấy bài viết theo ID
 */
function getPostById(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id);
}

/**
 * Lấy thống kê tổng quan (hỗ trợ tính toán theo bộ lọc động)
 */
function getStats(options = {}) {
  const db = getDb();
  const { whereClause, conditions, params } = buildPostsFilterClause(options);

  const counts = db.prepare(`
    SELECT
      COUNT(*) as totalPosts,
      SUM(CASE WHEN publisher_status = 'FOUND' THEN 1 ELSE 0 END) as found,
      SUM(CASE WHEN publisher_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN publisher_status = 'NOT_FOUND' THEN 1 ELSE 0 END) as notFound,
      SUM(CASE WHEN publisher_status IN ('ERROR', 'POST_UNAVAILABLE', 'LOGIN_REQUIRED') THEN 1 ELSE 0 END) as errors,
      SUM(CASE WHEN post_type = 'SHARED' THEN 1 ELSE 0 END) as sharedPosts,
      SUM(CASE WHEN post_type != 'SHARED' OR post_type IS NULL THEN 1 ELSE 0 END) as originalPosts,
      COALESCE(SUM(likes_count), 0) as totalLikes,
      COALESCE(SUM(comments_count), 0) as totalComments,
      COALESCE(SUM(shares_count), 0) as totalShares
    FROM posts
    ${whereClause}
  `).get(params);

  // Thống kê danh sách publisher trong tập kết quả lọc
  const pubConditions = [`publisher_status = 'FOUND'`, `publisher_name IS NOT NULL`, `TRIM(publisher_name) != ''`];
  if (conditions.length > 0) {
    pubConditions.push(...conditions);
  }

  const publishers = db.prepare(`
    SELECT publisher_name, COUNT(*) as count
    FROM posts
    WHERE ${pubConditions.join(' AND ')}
    GROUP BY publisher_name
    ORDER BY count DESC
  `).all(params);

  return {
    totalPosts: counts ? counts.totalPosts || 0 : 0,
    found: counts ? counts.found || 0 : 0,
    pending: counts ? counts.pending || 0 : 0,
    notFound: counts ? counts.notFound || 0 : 0,
    errors: counts ? counts.errors || 0 : 0,
    originalPosts: counts ? counts.originalPosts || 0 : 0,
    sharedPosts: counts ? counts.sharedPosts || 0 : 0,
    totalLikes: counts ? counts.totalLikes || 0 : 0,
    totalComments: counts ? counts.totalComments || 0 : 0,
    totalShares: counts ? counts.totalShares || 0 : 0,
    totalEngagements: (counts ? counts.totalLikes || 0 : 0) + (counts ? counts.totalComments || 0 : 0) + (counts ? counts.totalShares || 0 : 0),
    publisherCount: publishers.length,
    publishers
  };
}

/**
 * Lấy danh sách tên tất cả publisher đã tìm thấy
 */
function getPublishersList() {
  const db = getDb();
  return db.prepare(`
    SELECT publisher_name, COUNT(*) as count
    FROM posts
    WHERE publisher_status = 'FOUND' AND publisher_name IS NOT NULL AND TRIM(publisher_name) != ''
    GROUP BY publisher_name
    ORDER BY count DESC
  `).all();
}

/**
 * Lấy danh sách bài viết theo danh sách ID (phục vụ Batch Rescan)
 */
function getPostsByIds(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`
    SELECT * FROM posts
    WHERE id IN (${placeholders})
    ORDER BY created_time DESC
  `).all(...ids);
}

/**
 * Lấy bảng xếp hạng hiệu suất Người đăng (Leaderboard & KPI Analytics)
 */
function getPublisherLeaderboard(options = {}) {
  const db = getDb();
  const { conditions, params } = buildPostsFilterClause(options);
  const pubConditions = [`publisher_status = 'FOUND'`, `publisher_name IS NOT NULL`, `TRIM(publisher_name) != ''`];
  if (conditions.length > 0) {
    pubConditions.push(...conditions);
  }
  const where = pubConditions.join(' AND ');

  return db.prepare(`
    SELECT
      publisher_name,
      COUNT(*) as post_count,
      COUNT(*) as total_posts,
      COALESCE(SUM(likes_count), 0) as total_likes,
      COALESCE(SUM(comments_count), 0) as total_comments,
      COALESCE(SUM(shares_count), 0) as total_shares,
      COALESCE(SUM(likes_count + comments_count + shares_count), 0) as total_engagements,
      ROUND(CAST(COALESCE(SUM(likes_count + comments_count + shares_count), 0) AS FLOAT) / COUNT(*), 1) as avg_engagement,
      SUM(CASE WHEN post_type = 'SHARED' THEN 1 ELSE 0 END) as shared_count,
      SUM(CASE WHEN post_type != 'SHARED' OR post_type IS NULL THEN 1 ELSE 0 END) as original_count,
      MAX(created_time) as last_posted_at
    FROM posts
    WHERE ${where}
    GROUP BY publisher_name
    ORDER BY total_engagements DESC, post_count DESC
  `).all(params);
}

/**
 * Lấy dữ liệu tổng hợp phục vụ hiển thị biểu đồ trực quan (Chart.js)
 * @param {Object} options - Các bộ lọc tương tự getPosts
 */
function getChartData(options = {}) {
  const db = getDb();
  const { whereClause, conditions, params } = buildPostsFilterClause(options);

  // 1. Xu hướng theo ngày (Daily trend)
  const trends = db.prepare(`
    SELECT
      SUBSTR(created_time, 1, 10) as date,
      COUNT(*) as post_count,
      COALESCE(SUM(likes_count), 0) as likes,
      COALESCE(SUM(comments_count), 0) as comments,
      COALESCE(SUM(shares_count), 0) as shares,
      COALESCE(SUM(likes_count + comments_count + shares_count), 0) as total_engagements
    FROM posts
    ${whereClause}
    GROUP BY date
    ORDER BY date ASC
  `).all(params);

  // 2. Phân bố loại bài viết (ORIGINAL vs SHARED)
  const postTypes = db.prepare(`
    SELECT
      COALESCE(post_type, 'ORIGINAL') as post_type,
      COUNT(*) as count
    FROM posts
    ${whereClause}
    GROUP BY post_type
    ORDER BY count DESC
  `).all(params);

  // 3. Top người đăng có nhiều tương tác nhất
  const pubConditions = [`publisher_status = 'FOUND'`, `publisher_name IS NOT NULL`, `TRIM(publisher_name) != ''`];
  if (conditions.length > 0) {
    pubConditions.push(...conditions);
  }
  const pubWhere = `WHERE ${pubConditions.join(' AND ')}`;

  const topPublishers = db.prepare(`
    SELECT
      publisher_name,
      COUNT(*) as post_count,
      COALESCE(SUM(likes_count), 0) as likes,
      COALESCE(SUM(comments_count), 0) as comments,
      COALESCE(SUM(shares_count), 0) as shares,
      COALESCE(SUM(likes_count + comments_count + shares_count), 0) as total_engagements
    FROM posts
    ${pubWhere}
    GROUP BY publisher_name
    ORDER BY total_engagements DESC, post_count DESC
    LIMIT 7
  `).all(params);

  return {
    trends,
    postTypes,
    topPublishers
  };
}

/**
 * Xóa sạch toàn bộ dữ liệu bài viết và các đợt đồng bộ
 */
function clearAllPostsData() {
  const db = getDb();
  let deletedPosts = 0;
  let deletedBatches = 0;
  const runTx = db.transaction(() => {
    deletedPosts = db.prepare('DELETE FROM posts').run().changes;
    deletedBatches = db.prepare('DELETE FROM sync_batches').run().changes;
  });
  runTx();
  return { deletedPosts, deletedBatches };
}

function closeDb() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {}
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  closeDb,
  clearAllPostsData,
  upsertPost,
  upsertPosts,
  updatePublisherResult,
  getPendingPosts,
  getPosts,
  getPostsByIds,
  getAllPostsForExport,
  getPostById,
  getStats,
  getChartData,
  getPublishersList,
  getPublisherLeaderboard,
  createSyncBatch,
  getSyncBatches
};

