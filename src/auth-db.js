const crypto = require('crypto');
const { getDb } = require('./db');

let schemaInitialized = false;

/**
 * Khởi tạo schema bảng xác thực người dùng trong SQLite
 */
function initAuthSchema() {
  if (schemaInitialized) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'REGISTER_VERIFY',
      expires_at TEXT NOT NULL,
      is_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_verifications_user_code ON email_verifications(user_id, code);
    CREATE INDEX IF NOT EXISTS idx_verifications_expires ON email_verifications(expires_at);

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
  `);

  schemaInitialized = true;
}

/**
 * Tạo người dùng mới
 */
function createUser({ email, passwordHash, fullName, role = 'user', isVerified = 0 }) {
  initAuthSchema();
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, is_verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    email.trim().toLowerCase(),
    passwordHash,
    fullName.trim(),
    role,
    isVerified ? 1 : 0,
    now,
    now
  );

  return findUserById(id);
}

/**
 * Tìm người dùng theo email
 */
function findUserByEmail(email) {
  initAuthSchema();
  if (!email) return null;
  const db = getDb();
  return db.prepare(`
    SELECT * FROM users WHERE email = ?
  `).get(email.trim().toLowerCase()) || null;
}

/**
 * Tìm người dùng theo ID (không trả về password_hash cho client)
 */
function findUserById(id, includePassword = false) {
  initAuthSchema();
  if (!id) return null;
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  if (!user) return null;
  if (!includePassword) {
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }
  return user;
}

/**
 * Cập nhật trạng thái xác thực email của người dùng
 */
function updateUserVerified(userId, isVerified = 1) {
  initAuthSchema();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET is_verified = ?, updated_at = ?
    WHERE id = ?
  `).run(isVerified ? 1 : 0, now, userId);
  return findUserById(userId);
}

/**
 * Cập nhật mật khẩu người dùng
 */
function updateUserPassword(userId, newPasswordHash) {
  initAuthSchema();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET password_hash = ?, updated_at = ?
    WHERE id = ?
  `).run(newPasswordHash, now, userId);
  return findUserById(userId);
}

/**
 * Cập nhật thời điểm đăng nhập cuối
 */
function updateUserLastLogin(userId) {
  initAuthSchema();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET last_login_at = ?
    WHERE id = ?
  `).run(now, userId);
}

/**
 * Tạo mã OTP xác thực email
 */
function createVerificationCode({ userId, code, type = 'REGISTER_VERIFY', expiresInMinutes = 15 }) {
  initAuthSchema();
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();

  // Hủy các mã cũ cùng loại của user chưa dùng
  db.prepare(`
    UPDATE email_verifications
    SET is_used = 1
    WHERE user_id = ? AND type = ? AND is_used = 0
  `).run(userId, type);

  db.prepare(`
    INSERT INTO email_verifications (id, user_id, code, type, expires_at, is_used, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, userId, String(code).trim(), type, expiresAt, createdAt);

  return { id, code, expiresAt };
}

/**
 * Tìm mã xác nhận còn hiệu lực và chưa sử dụng
 */
function findValidVerificationCode({ userId, code, type = 'REGISTER_VERIFY' }) {
  initAuthSchema();
  const db = getDb();
  const now = new Date().toISOString();

  return db.prepare(`
    SELECT * FROM email_verifications
    WHERE user_id = ? AND code = ? AND type = ? AND is_used = 0 AND expires_at >= ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId, String(code).trim(), type, now) || null;
}

/**
 * Đánh dấu mã đã sử dụng
 */
function markCodeUsed(codeId) {
  initAuthSchema();
  const db = getDb();
  db.prepare(`
    UPDATE email_verifications
    SET is_used = 1
    WHERE id = ?
  `).run(codeId);
}

/**
 * Tạo phiên đăng nhập Session Token
 */
function createUserSession({ userId, token, expiresInDays = 7 }) {
  initAuthSchema();
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO user_sessions (id, user_id, token, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, token, expiresAt, createdAt);

  return { id, token, expiresAt };
}

/**
 * Lấy phiên đăng nhập theo Token
 */
function findSessionByToken(token) {
  initAuthSchema();
  if (!token) return null;
  const db = getDb();
  const now = new Date().toISOString();

  const session = db.prepare(`
    SELECT s.*, u.email, u.full_name, u.role, u.is_verified
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at >= ?
  `).get(token, now);

  return session || null;
}

/**
 * Xóa phiên đăng nhập (Đăng xuất)
 */
function deleteSession(token) {
  initAuthSchema();
  if (!token) return false;
  const db = getDb();
  return db.prepare(`DELETE FROM user_sessions WHERE token = ?`).run(token).changes > 0;
}

/**
 * Xóa toàn bộ phiên đăng nhập của 1 user
 */
function deleteUserSessions(userId) {
  initAuthSchema();
  const db = getDb();
  return db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(userId).changes;
}

/**
 * Lấy danh sách người dùng có hỗ trợ tìm kiếm và lọc vai trò (dành cho Admin)
 */
function listUsers({ limit = 50, offset = 0, search = '', role = '' } = {}) {
  initAuthSchema();
  const db = getDb();

  const conditions = [];
  const params = [];

  if (search && String(search).trim()) {
    const s = `%${String(search).trim()}%`;
    conditions.push(`(email LIKE ? OR full_name LIKE ?)`);
    params.push(s, s);
  }

  if (role && (role === 'admin' || role === 'user')) {
    conditions.push(`role = ?`);
    params.push(role);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, email, full_name, role, is_verified, created_at, updated_at, last_login_at
    FROM users
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

/**
 * Đếm tổng số người dùng có kèm bộ lọc
 */
function getUserCount({ search = '', role = '' } = {}) {
  initAuthSchema();
  const db = getDb();

  const conditions = [];
  const params = [];

  if (search && String(search).trim()) {
    const s = `%${String(search).trim()}%`;
    conditions.push(`(email LIKE ? OR full_name LIKE ?)`);
    params.push(s, s);
  }

  if (role && (role === 'admin' || role === 'user')) {
    conditions.push(`role = ?`);
    params.push(role);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const row = db.prepare(`SELECT COUNT(*) as c FROM users ${whereClause}`).get(...params);
  return row ? row.c : 0;
}

/**
 * Cập nhật vai trò người dùng (Admin / User)
 */
function updateUserRole(userId, newRole) {
  initAuthSchema();
  if (!['admin', 'user'].includes(newRole)) {
    throw new Error('Vai trò không hợp lệ. Chỉ chấp nhận admin hoặc user.');
  }
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE users SET role = ?, updated_at = ? WHERE id = ?
  `).run(newRole, now, userId);

  return result.changes > 0;
}

/**
 * Cập nhật trạng thái kích hoạt hoặc khóa tài khoản
 */
function updateUserStatus(userId, isVerified) {
  initAuthSchema();
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE users SET is_verified = ?, updated_at = ? WHERE id = ?
  `).run(isVerified ? 1 : 0, now, userId);

  return result.changes > 0;
}

/**
 * Xóa vĩnh viễn tài khoản người dùng và các phiên liên quan
 */
function deleteUser(userId) {
  initAuthSchema();
  const db = getDb();
  deleteUserSessions(userId);
  db.prepare(`DELETE FROM email_verifications WHERE user_id = ?`).run(userId);
  const result = db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  return result.changes > 0;
}

/**
 * Lấy các chỉ số thống kê tổng quan cho Admin Dashboard
 */
function getAdminStats() {
  initAuthSchema();
  const db = getDb();
  const now = new Date().toISOString();

  const totalUsers = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() || {}).c || 0;
  const adminCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'admin'`).get() || {}).c || 0;
  const userCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'user'`).get() || {}).c || 0;
  const verifiedCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE is_verified = 1`).get() || {}).c || 0;
  const unverifiedCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE is_verified = 0`).get() || {}).c || 0;
  const activeSessions = (db.prepare(`SELECT COUNT(*) as c FROM user_sessions WHERE expires_at >= ?`).get(now) || {}).c || 0;

  return {
    totalUsers,
    adminCount,
    userCount,
    verifiedCount,
    unverifiedCount,
    activeSessions
  };
}

/**
 * Khởi tạo tài khoản Admin mặc định nếu hệ thống chưa có Admin nào
 */
function seedAdminUser({ email, passwordHash, fullName }) {
  initAuthSchema();
  const db = getDb();

  // Kiểm tra xem đã có admin nào chưa
  const existingAdmin = db.prepare(`SELECT * FROM users WHERE role = 'admin' LIMIT 1`).get();
  if (existingAdmin) {
    return { created: false, user: findUserById(existingAdmin.id) };
  }

  // Kiểm tra xem email admin dự kiến đã được tạo thành user thường chưa
  const cleanEmail = email.trim().toLowerCase();
  const existingUser = findUserByEmail(cleanEmail);

  const now = new Date().toISOString();
  if (existingUser) {
    db.prepare(`
      UPDATE users SET role = 'admin', is_verified = 1, password_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, now, existingUser.id);
    return { created: true, upgraded: true, user: findUserById(existingUser.id) };
  }

  // Tạo mới tài khoản admin
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, is_verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)
  `).run(id, cleanEmail, passwordHash, fullName.trim(), now, now);

  return { created: true, user: findUserById(id) };
}

module.exports = {
  initAuthSchema,
  createUser,
  findUserByEmail,
  findUserById,
  updateUserVerified,
  updateUserPassword,
  updateUserLastLogin,
  createVerificationCode,
  findValidVerificationCode,
  markCodeUsed,
  createUserSession,
  findSessionByToken,
  deleteSession,
  deleteUserSessions,
  listUsers,
  getUserCount,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  getAdminStats,
  seedAdminUser
};

