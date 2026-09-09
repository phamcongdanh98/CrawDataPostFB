const Database = require('better-sqlite3');
const config = require('./config');
const { normalizeDateStr } = require('./utils');

let dbInstance = null;

/**
 * Lấy hoặc khởi tạo instance kết nối SQLite
 */
function getDb() {
  if (!dbInstance) {
    dbInstance = new Database(config.DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
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
  `);

  // Tự động bổ sung cột nếu bảng đã được tạo từ trước
  try { db.exec(`ALTER TABLE posts ADD COLUMN likes_count INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE posts ADD COLUMN comments_count INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE posts ADD COLUMN shares_count INTEGER DEFAULT 0;`); } catch (e) {}
}

/**
 * Thêm mới hoặc cập nhật bài viết từ Meta Graph API
 * Không ghi đè thông tin publisher nếu bài đã FOUND
 */
function upsertPost(db, post) {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT id, publisher_status FROM posts WHERE id = ?`).get(post.id);

  const likes = post.likes_count ?? 0;
  const comments = post.comments_count ?? 0;
  const shares = post.shares_count ?? 0;

  if (!existing) {
    // Insert mới hoàn toàn
    const stmt = db.prepare(`
      INSERT INTO posts (
        id, page_id, message, created_time, permalink_url,
        likes_count, comments_count, shares_count,
        publisher_status, attempt_count, created_at, updated_at
      ) VALUES (
        @id, @page_id, @message, @created_time, @permalink_url,
        @likes, @comments, @shares,
        'PENDING', 0, @now, @now
      )
    `);
    stmt.run({
      id: post.id,
      page_id: post.page_id,
      message: post.message || '',
      created_time: post.created_time,
      permalink_url: post.permalink_url,
      likes,
      comments,
      shares,
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
        likes_count = @likes,
        comments_count = @comments,
        shares_count = @shares,
        updated_at = @now
      WHERE id = @id
    `);
    stmt.run({
      id: post.id,
      message: post.message || '',
      created_time: post.created_time,
      permalink_url: post.permalink_url,
      likes,
      comments,
      shares,
      now
    });
    return { inserted: false, updated: true };
  }
}

/**
 * Upsert danh sách bài viết trong 1 transaction
 */
function upsertPosts(posts) {
  const db = getDb();
  let insertedCount = 0;
  let updatedCount = 0;

  const runTx = db.transaction((items) => {
    for (const item of items) {
      const res = upsertPost(db, item);
      if (res.inserted) insertedCount++;
      if (res.updated) updatedCount++;
    }
  });

  runTx(posts);
  return { insertedCount, updatedCount, total: posts.length };
}

/**
 * Cập nhật kết quả trích xuất publisher cho 1 bài viết
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
    last_error: result.reason || result.error || null,
    now
  });
}

/**
 * Lấy danh sách bài viết chờ crawl publisher
 * @param {boolean} force - nếu true thì crawl cả bài đã NOT_FOUND / ERROR / PENDING
 */
function getPendingPosts(limit = 100, force = false) {
  const db = getDb();
  let query = '';
  if (force) {
    query = `SELECT * FROM posts ORDER BY created_time DESC LIMIT ?`;
  } else {
    query = `SELECT * FROM posts WHERE publisher_status = 'PENDING' ORDER BY created_time DESC LIMIT ?`;
  }
  return db.prepare(query).all(limit);
}

/**
 * Lấy danh sách bài viết theo bộ lọc có phân trang
 */
function getPosts(options = {}) {
  const db = getDb();
  const {
    since,
    until,
    publisher,
    status,
    search,
    page = 1,
    limit = 20
  } = options;

  const conditions = [];
  const params = {};

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
  if (search && search.trim()) {
    conditions.push(`(message LIKE @search OR id LIKE @search OR publisher_name LIKE @search)`);
    params.search = `%${search.trim()}%`;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Đếm tổng số bài thỏa mãn điều kiện
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM posts ${whereClause}`).get(params);
  const total = countRow ? countRow.count : 0;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const offset = (pageNum - 1) * limitNum;

  params.limit = limitNum;
  params.offset = offset;

  const items = db.prepare(`
    SELECT * FROM posts
    ${whereClause}
    ORDER BY created_time DESC
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
  const { since, until, publisher, status, search } = options;

  const conditions = [];
  const params = {};

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
  if (search && search.trim()) {
    conditions.push(`(message LIKE @search OR id LIKE @search OR publisher_name LIKE @search)`);
    params.search = `%${search.trim()}%`;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT * FROM posts
    ${whereClause}
    ORDER BY created_time DESC
  `).all(params);
}

/**
 * Lấy bài viết theo ID
 */
function getPostById(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id);
}

/**
 * Lấy thống kê tổng quan
 */
function getStats() {
  const db = getDb();

  const counts = db.prepare(`
    SELECT
      COUNT(*) as totalPosts,
      SUM(CASE WHEN publisher_status = 'FOUND' THEN 1 ELSE 0 END) as found,
      SUM(CASE WHEN publisher_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN publisher_status = 'NOT_FOUND' THEN 1 ELSE 0 END) as notFound,
      SUM(CASE WHEN publisher_status IN ('ERROR', 'POST_UNAVAILABLE', 'LOGIN_REQUIRED') THEN 1 ELSE 0 END) as errors
    FROM posts
  `).get();

  const publishers = db.prepare(`
    SELECT publisher_name, COUNT(*) as count
    FROM posts
    WHERE publisher_status = 'FOUND' AND publisher_name IS NOT NULL AND TRIM(publisher_name) != ''
    GROUP BY publisher_name
    ORDER BY count DESC
  `).all();

  return {
    totalPosts: counts.totalPosts || 0,
    found: counts.found || 0,
    pending: counts.pending || 0,
    notFound: counts.notFound || 0,
    errors: counts.errors || 0,
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
  upsertPost,
  upsertPosts,
  updatePublisherResult,
  getPendingPosts,
  getPosts,
  getAllPostsForExport,
  getPostById,
  getStats,
  getPublishersList
};
