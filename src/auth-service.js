const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const authDb = require('./auth-db');
const emailService = require('./email-service');

/**
 * Validate định dạng email
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

/**
 * Sinh mã OTP ngẫu nhiên 6 chữ số
 */
function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Đăng ký tài khoản mới
 */
async function register({ email, password, fullName }) {
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: 'Địa chỉ Email không hợp lệ.' };
  }
  if (!password || String(password).length < 6) {
    return { ok: false, error: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.' };
  }
  if (!fullName || !String(fullName).trim()) {
    return { ok: false, error: 'Vui lòng nhập họ và tên của bạn.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim();
  const existingUser = authDb.findUserByEmail(cleanEmail);

  if (existingUser) {
    if (existingUser.is_verified === 1) {
      return { ok: false, error: 'Địa chỉ Email này đã được đăng ký trên hệ thống. Vui lòng đăng nhập.' };
    }
    // Nếu tài khoản đã tạo nhưng chưa xác minh, gửi lại mã OTP
    const otpCode = generateOtpCode();
    authDb.createVerificationCode({
      userId: existingUser.id,
      code: otpCode,
      type: 'REGISTER_VERIFY',
      expiresInMinutes: 15
    });

    const mailRes = await emailService.sendVerificationEmail({
      to: cleanEmail,
      fullName: existingUser.full_name,
      code: otpCode
    });

    return {
      ok: true,
      pendingVerification: true,
      email: cleanEmail,
      fullName: existingUser.full_name,
      simulatedCode: mailRes.simulated ? mailRes.devCode : null,
      message: 'Tài khoản chưa được kích hoạt. Hệ thống đã gửi lại mã xác nhận mới tới email của bạn.'
    };
  }

  // Hash mật khẩu an toàn
  const passwordHash = await bcrypt.hash(password, 10);

  // Tạo người dùng
  const newUser = authDb.createUser({
    email: cleanEmail,
    passwordHash,
    fullName: cleanName,
    role: 'user',
    isVerified: 0
  });

  // Sinh và lưu mã OTP kích hoạt
  const otpCode = generateOtpCode();
  authDb.createVerificationCode({
    userId: newUser.id,
    code: otpCode,
    type: 'REGISTER_VERIFY',
    expiresInMinutes: 15
  });

  // Gửi email xác nhận
  const mailRes = await emailService.sendVerificationEmail({
    to: cleanEmail,
    fullName: cleanName,
    code: otpCode
  });

  return {
    ok: true,
    pendingVerification: true,
    email: cleanEmail,
    fullName: cleanName,
    simulatedCode: mailRes.simulated ? mailRes.devCode : null,
    message: 'Đăng ký tài khoản thành công! Vui lòng kiểm tra hộp thư email để lấy mã xác nhận.'
  };
}

/**
 * Xác thực email bằng mã OTP 6 số
 */
async function verifyEmail({ email, code }) {
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: 'Địa chỉ Email không hợp lệ.' };
  }
  if (!code || !String(code).trim()) {
    return { ok: false, error: 'Vui lòng nhập mã xác thực OTP.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = String(code).trim();
  const user = authDb.findUserByEmail(cleanEmail);

  if (!user) {
    return { ok: false, error: 'Không tìm thấy thông tin tài khoản với email này.' };
  }

  if (user.is_verified === 1) {
    // Nếu đã xác minh rồi thì tạo session đăng nhập luôn
    const sessionToken = crypto.randomBytes(32).toString('hex');
    authDb.createUserSession({ userId: user.id, token: sessionToken, expiresInDays: 7 });
    authDb.updateUserLastLogin(user.id);

    return {
      ok: true,
      alreadyVerified: true,
      token: sessionToken,
      user: authDb.findUserById(user.id),
      message: 'Tài khoản đã được xác thực trước đó. Đăng nhập thành công!'
    };
  }

  const validRecord = authDb.findValidVerificationCode({
    userId: user.id,
    code: cleanCode,
    type: 'REGISTER_VERIFY'
  });

  if (!validRecord) {
    return {
      ok: false,
      error: 'Mã xác nhận không chính xác hoặc đã hết thời gian hiệu lực (15 phút). Vui lòng thử lại hoặc yêu cầu gửi lại mã mới.'
    };
  }

  // Đánh dấu mã đã dùng và kích hoạt tài khoản
  authDb.markCodeUsed(validRecord.id);
  const updatedUser = authDb.updateUserVerified(user.id, 1);

  // Tạo phiên đăng nhập tự động ngay sau khi xác thực
  const sessionToken = crypto.randomBytes(32).toString('hex');
  authDb.createUserSession({ userId: user.id, token: sessionToken, expiresInDays: 7 });
  authDb.updateUserLastLogin(user.id);

  return {
    ok: true,
    token: sessionToken,
    user: updatedUser,
    message: 'Chúc mừng! Tài khoản của bạn đã được kích hoạt thành công.'
  };
}

/**
 * Gửi lại mã OTP xác thực
 */
async function resendVerificationCode({ email }) {
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: 'Địa chỉ Email không hợp lệ.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = authDb.findUserByEmail(cleanEmail);

  if (!user) {
    return { ok: false, error: 'Không tìm thấy tài khoản với email này.' };
  }

  if (user.is_verified === 1) {
    return { ok: false, error: 'Tài khoản này đã được kích hoạt rồi. Bạn có thể đăng nhập ngay.' };
  }

  const otpCode = generateOtpCode();
  authDb.createVerificationCode({
    userId: user.id,
    code: otpCode,
    type: 'REGISTER_VERIFY',
    expiresInMinutes: 15
  });

  const mailRes = await emailService.sendVerificationEmail({
    to: cleanEmail,
    fullName: user.full_name,
    code: otpCode
  });

  return {
    ok: true,
    email: cleanEmail,
    simulatedCode: mailRes.simulated ? mailRes.devCode : null,
    message: 'Mã xác nhận mới đã được gửi tới hộp thư của bạn.'
  };
}

/**
 * Đăng nhập người dùng
 */
async function login({ email, password }) {
  if (!email || !password) {
    return { ok: false, error: 'Vui lòng điền đầy đủ email và mật khẩu.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = authDb.findUserByEmail(cleanEmail);

  if (!user) {
    return { ok: false, error: 'Email hoặc mật khẩu không chính xác.' };
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordMatch) {
    return { ok: false, error: 'Email hoặc mật khẩu không chính xác.' };
  }

  // Nếu tài khoản chưa xác thực email, yêu cầu kích hoạt
  if (user.is_verified !== 1) {
    return {
      ok: false,
      requireVerification: true,
      email: cleanEmail,
      fullName: user.full_name,
      error: 'Tài khoản chưa được kích hoạt qua email. Vui lòng nhập mã xác nhận OTP để kích hoạt.'
    };
  }

  // Đăng nhập thành công -> Tạo phiên
  const sessionToken = crypto.randomBytes(32).toString('hex');
  authDb.createUserSession({ userId: user.id, token: sessionToken, expiresInDays: 7 });
  authDb.updateUserLastLogin(user.id);

  return {
    ok: true,
    token: sessionToken,
    user: authDb.findUserById(user.id),
    message: 'Đăng nhập thành công!'
  };
}

/**
 * Đăng xuất
 */
function logout(token) {
  if (!token) return { ok: true };
  authDb.deleteSession(token);
  return { ok: true, message: 'Đăng xuất thành công.' };
}

/**
 * Lấy thông tin người dùng hiện tại từ session token
 */
function getCurrentUser(token) {
  if (!token) return null;
  const session = authDb.findSessionByToken(token);
  if (!session) return null;

  return {
    id: session.user_id,
    email: session.email,
    fullName: session.full_name,
    role: session.role,
    isVerified: session.is_verified === 1
  };
}

/**
 * Yêu cầu cấp lại mật khẩu qua email
 */
async function forgotPassword(email) {
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: 'Địa chỉ Email không hợp lệ.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = authDb.findUserByEmail(cleanEmail);

  if (!user) {
    // Tránh lộ thông tin email có tồn tại hay không
    return {
      ok: true,
      message: 'Nếu email tồn tại trên hệ thống, mã khôi phục mật khẩu sẽ được gửi đến bạn.'
    };
  }

  const otpCode = generateOtpCode();
  authDb.createVerificationCode({
    userId: user.id,
    code: otpCode,
    type: 'PASSWORD_RESET',
    expiresInMinutes: 15
  });

  const mailRes = await emailService.sendPasswordResetEmail({
    to: cleanEmail,
    fullName: user.full_name,
    code: otpCode
  });

  return {
    ok: true,
    email: cleanEmail,
    simulatedCode: mailRes.simulated ? mailRes.devCode : null,
    message: 'Mã đặt lại mật khẩu đã được gửi tới email của bạn.'
  };
}

/**
 * Đặt lại mật khẩu mới bằng OTP
 */
async function resetPassword({ email, code, newPassword }) {
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: 'Địa chỉ Email không hợp lệ.' };
  }
  if (!code || !String(code).trim()) {
    return { ok: false, error: 'Vui lòng nhập mã xác nhận.' };
  }
  if (!newPassword || String(newPassword).length < 6) {
    return { ok: false, error: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = authDb.findUserByEmail(cleanEmail);
  if (!user) {
    return { ok: false, error: 'Không tìm thấy tài khoản.' };
  }

  const validRecord = authDb.findValidVerificationCode({
    userId: user.id,
    code: String(code).trim(),
    type: 'PASSWORD_RESET'
  });

  if (!validRecord) {
    return { ok: false, error: 'Mã xác nhận không chính xác hoặc đã hết thời gian hiệu lực.' };
  }

  authDb.markCodeUsed(validRecord.id);
  const passwordHash = await bcrypt.hash(newPassword, 10);
  authDb.updateUserPassword(user.id, passwordHash);

  // Đăng xuất khỏi mọi phiên cũ
  authDb.deleteUserSessions(user.id);

  return {
    ok: true,
    message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.'
  };
}

/**
 * Khởi tạo tài khoản Admin mặc định hệ thống
 */
async function seedAdminAccount() {
  const defaultEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
  const defaultPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const defaultName = process.env.ADMIN_NAME || 'Quản Trị Viên Hệ Thống';

  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const result = authDb.seedAdminUser({
    email: defaultEmail,
    passwordHash,
    fullName: defaultName
  });

  return {
    ...result,
    email: defaultEmail,
    password: defaultPassword,
    fullName: defaultName
  };
}

/**
 * Admin: Lấy danh sách thành viên với tìm kiếm & phân trang
 */
function adminListUsers({ search = '', role = '', page = 1, limit = 20 } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (p - 1) * l;

  const users = authDb.listUsers({ limit: l, offset, search, role });
  const total = authDb.getUserCount({ search, role });

  return {
    ok: true,
    users,
    total,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l)
  };
}

/**
 * Admin: Tạo trực tiếp người dùng mới (không cần qua mã OTP xác minh)
 */
async function adminCreateUser({ email, password, fullName, role = 'user', isVerified = 1 }) {
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: 'Địa chỉ Email không hợp lệ.' };
  }
  if (!password || String(password).length < 6) {
    return { ok: false, error: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.' };
  }
  if (!fullName || !String(fullName).trim()) {
    return { ok: false, error: 'Vui lòng nhập họ và tên.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = authDb.findUserByEmail(cleanEmail);
  if (existing) {
    return { ok: false, error: 'Địa chỉ email này đã tồn tại trong hệ thống.' };
  }

  const validRole = role === 'admin' ? 'admin' : 'user';
  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = authDb.createUser({
    email: cleanEmail,
    passwordHash,
    fullName: fullName.trim(),
    role: validRole,
    isVerified: isVerified ? 1 : 0
  });

  return {
    ok: true,
    user: newUser,
    message: 'Tạo tài khoản thành công!'
  };
}

/**
 * Admin: Cập nhật vai trò thành viên (Admin <-> User)
 */
function adminUpdateUserRole(targetUserId, newRole, currentAdminId) {
  if (!['admin', 'user'].includes(newRole)) {
    return { ok: false, error: 'Vai trò không hợp lệ.' };
  }

  if (targetUserId === currentAdminId && newRole !== 'admin') {
    return { ok: false, error: 'Bạn không thể tự giáng quyền của chính tài khoản đang đăng nhập.' };
  }

  const targetUser = authDb.findUserById(targetUserId);
  if (!targetUser) {
    return { ok: false, error: 'Không tìm thấy người dùng này.' };
  }

  authDb.updateUserRole(targetUserId, newRole);
  return {
    ok: true,
    message: `Đã đổi vai trò của "${targetUser.full_name}" sang ${newRole === 'admin' ? 'Quản Trị Viên (Admin)' : 'Người Dùng (User)'}.`
  };
}

/**
 * Admin: Kích hoạt hoặc Khóa tài khoản
 */
function adminToggleUserStatus(targetUserId, isVerified, currentAdminId) {
  if (targetUserId === currentAdminId && !isVerified) {
    return { ok: false, error: 'Bạn không thể tự khóa tài khoản của chính mình.' };
  }

  const targetUser = authDb.findUserById(targetUserId);
  if (!targetUser) {
    return { ok: false, error: 'Không tìm thấy người dùng này.' };
  }

  authDb.updateUserStatus(targetUserId, isVerified ? 1 : 0);
  return {
    ok: true,
    message: isVerified
      ? `Đã kích hoạt tài khoản "${targetUser.full_name}".`
      : `Đã tạm khóa tài khoản "${targetUser.full_name}".`
  };
}

/**
 * Admin: Xóa vĩnh viễn tài khoản
 */
function adminDeleteUser(targetUserId, currentAdminId) {
  if (targetUserId === currentAdminId) {
    return { ok: false, error: 'Bạn không thể xóa tài khoản của chính mình khi đang đăng nhập!' };
  }

  const targetUser = authDb.findUserById(targetUserId);
  if (!targetUser) {
    return { ok: false, error: 'Không tìm thấy người dùng này.' };
  }

  authDb.deleteUser(targetUserId);
  return {
    ok: true,
    message: `Đã xóa vĩnh viễn tài khoản "${targetUser.email}".`
  };
}

/**
 * Admin: Lấy số liệu thống kê tổng quan
 */
function getAdminOverview() {
  const stats = authDb.getAdminStats();
  return {
    ok: true,
    stats
  };
}

module.exports = {
  register,
  verifyEmail,
  resendVerificationCode,
  login,
  logout,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  seedAdminAccount,
  adminListUsers,
  adminCreateUser,
  adminUpdateUserRole,
  adminToggleUserStatus,
  adminDeleteUser,
  getAdminOverview
};

