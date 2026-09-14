const nodemailer = require('nodemailer');
const config = require('./config');

/**
 * Tạo transporter nodemailer dựa trên cấu hình hiện tại
 */
function createTransporter(customConfig = null) {
  const host = customConfig?.host || config.SMTP_HOST;
  const port = customConfig?.port || config.SMTP_PORT;
  const secure = customConfig?.secure !== undefined ? customConfig.secure : config.SMTP_SECURE;
  const user = customConfig?.user || config.SMTP_USER;
  const pass = customConfig?.pass || config.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Kiểm tra kết nối SMTP Gmail
 */
async function testSmtpConnection(customConfig = null) {
  const transporter = createTransporter(customConfig);
  if (!transporter) {
    return {
      ok: false,
      error: 'Chưa cấu hình tài khoản Email hoặc Mật khẩu ứng dụng (SMTP_USER / SMTP_PASS).'
    };
  }

  try {
    await transporter.verify();
    return {
      ok: true,
      message: 'Kết nối máy chủ Gmail SMTP thành công 100%! Sẵn sàng gửi thư.'
    };
  } catch (err) {
    let helpMsg = '';
    if (err.message.includes('Invalid login') || err.message.includes('Username and Password not accepted')) {
      helpMsg = ' (Lưu ý: Gmail yêu cầu sử dụng Mật Khẩu Ứng Dụng - App Password 16 ký tự của Google, không dùng mật khẩu đăng nhập thông thường).';
    }
    return {
      ok: false,
      error: `Lỗi kết nối Gmail SMTP: ${err.message}${helpMsg}`
    };
  }
}

/**
 * Gửi email chứa mã OTP kích hoạt tài khoản
 */
async function sendVerificationEmail({ to, fullName, code }) {
  const cleanTo = String(to || '').trim();
  const name = String(fullName || 'Quý khách').trim();
  const otp = String(code).trim();

  // Chế độ mô phỏng khi chưa điền mật khẩu Gmail
  if (!config.isSmtpConfigured()) {
    console.log(`\n=============================================================`);
    console.log(`📩 [DEV EMAIL SIMULATOR] GỬI MÃ XÁC THỰC TÀI KHOẢN`);
    console.log(`👉 Người nhận: ${cleanTo} (${name})`);
    console.log(`🔑 MÃ OTP KÍCH HOẠT:  👉👉👉  ${otp}  👈👈👈`);
    console.log(`⏰ Thời hạn: 15 phút`);
    console.log(`💡 Để gửi thư thật vào hộp thư Gmail, vui lòng cấu hình SMTP_USER & SMTP_PASS`);
    console.log(`=============================================================\n`);

    return {
      ok: true,
      simulated: true,
      devCode: otp,
      message: 'Đã tạo mã xác nhận thành công (Chế độ mô phỏng: kiểm tra log console).'
    };
  }

  const transporter = createTransporter();
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 20px; margin: 0; }
      .email-card { max-width: 520px; margin: 0 auto; background: #131d31; border: 1px solid #1e293b; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
      .email-header { background: linear-gradient(135deg, #0ea5e9, #6366f1); padding: 24px; text-align: center; }
      .email-header h1 { margin: 0; font-size: 20px; color: #ffffff; letter-spacing: 0.5px; }
      .email-body { padding: 30px 24px; }
      .greeting { font-size: 16px; margin-bottom: 16px; color: #cbd5e1; }
      .description { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px; }
      .otp-box { background: #090d16; border: 2px dashed #38bdf8; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
      .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; font-family: monospace; }
      .otp-hint { font-size: 12px; color: #64748b; margin-top: 6px; }
      .security-notice { background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; padding: 12px 14px; font-size: 13px; color: #fbbf24; border-radius: 4px; margin-top: 24px; }
      .email-footer { background: #0c121e; padding: 16px; text-align: center; font-size: 12px; color: #475569; border-top: 1px solid #1e293b; }
    </style>
  </head>
  <body>
    <div class="email-card">
      <div class="email-header">
        <h1>📊 HỆ THỐNG QUẢN LÝ & THỐNG KÊ FANPAGE</h1>
      </div>
      <div class="email-body">
        <p class="greeting">Xin chào <b>${escapeHtml(name)}</b>,</p>
        <p class="description">
          Cảm ơn bạn đã đăng ký tài khoản trên Hệ thống Thống Kê & Phân Tích Fanpage. 
          Vui lòng sử dụng mã xác nhận (OTP) dưới đây để kích hoạt tài khoản của bạn:
        </p>

        <div class="otp-box">
          <div class="otp-code">${otp}</div>
          <div class="otp-hint">Mã xác nhận gồm 6 chữ số (Hiệu lực trong 15 phút)</div>
        </div>

        <div class="security-notice">
          ⚠️ <b>Lưu ý bảo mật:</b> Không chia sẻ mã OTP này cho bất kỳ ai để bảo vệ thông tin tài khoản của bạn.
        </div>
      </div>
      <div class="email-footer">
        Hệ thống tự động • Vui lòng không trả lời thư này
      </div>
    </div>
  </body>
  </html>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: config.SMTP_FROM,
      to: cleanTo,
      subject: `[${otp}] Mã xác nhận đăng ký tài khoản Fanpage Analytics`,
      text: `Xin chào ${name},\n\nMã xác thực kích hoạt tài khoản của bạn là: ${otp}\nMã có hiệu lực trong 15 phút.\n\nTrân trọng.`,
      html: htmlContent
    });

    return {
      ok: true,
      messageId: info.messageId,
      message: 'Đã gửi mã xác nhận qua email thành công.'
    };
  } catch (err) {
    console.error('[EmailService] Lỗi gửi email xác nhận:', err);
    return {
      ok: false,
      error: `Không thể gửi email: ${err.message}`
    };
  }
}

/**
 * Gửi email đặt lại mật khẩu
 */
async function sendPasswordResetEmail({ to, fullName, code }) {
  const cleanTo = String(to || '').trim();
  const name = String(fullName || 'Quý khách').trim();
  const otp = String(code).trim();

  if (!config.isSmtpConfigured()) {
    console.log(`\n=============================================================`);
    console.log(`🔑 [DEV EMAIL SIMULATOR] MÃ ĐẶT LẠI MẬT KHẨU`);
    console.log(`👉 Người nhận: ${cleanTo} (${name})`);
    console.log(`🔑 MÃ OTP ĐẶT LẠI:  👉👉👉  ${otp}  👈👈👈`);
    console.log(`⏰ Thời hạn: 15 phút`);
    console.log(`=============================================================\n`);

    return {
      ok: true,
      simulated: true,
      devCode: otp,
      message: 'Đã tạo mã đặt lại mật khẩu (Chế độ mô phỏng: kiểm tra log).'
    };
  }

  const transporter = createTransporter();
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 20px; margin: 0; }
      .email-card { max-width: 520px; margin: 0 auto; background: #131d31; border: 1px solid #1e293b; border-radius: 14px; overflow: hidden; }
      .email-header { background: linear-gradient(135deg, #ef4444, #f59e0b); padding: 24px; text-align: center; }
      .email-header h1 { margin: 0; font-size: 20px; color: #ffffff; }
      .email-body { padding: 30px 24px; }
      .otp-box { background: #090d16; border: 2px dashed #f87171; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
      .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #f87171; font-family: monospace; }
      .email-footer { background: #0c121e; padding: 16px; text-align: center; font-size: 12px; color: #475569; }
    </style>
  </head>
  <body>
    <div class="email-card">
      <div class="email-header">
        <h1>🔐 YÊU CẦU ĐẶT LẠI MẬT KHẨU</h1>
      </div>
      <div class="email-body">
        <p>Xin chào <b>${escapeHtml(name)}</b>,</p>
        <p>Hệ thống nhận được yêu cầu cấp lại mật khẩu cho tài khoản <b>${escapeHtml(cleanTo)}</b>.</p>
        <p>Vui lòng nhập mã bên dưới để tiến hành đặt mật khẩu mới:</p>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 6px;">Hiệu lực trong 15 phút</div>
        </div>
        <p style="font-size: 13px; color: #94a3b8;">Nếu bạn không yêu cầu hành động này, vui lòng bỏ qua thư này.</p>
      </div>
      <div class="email-footer">
        Hệ thống bảo mật Fanpage Stat
      </div>
    </div>
  </body>
  </html>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: config.SMTP_FROM,
      to: cleanTo,
      subject: `[${otp}] Mã đặt lại mật khẩu tài khoản Fanpage Analytics`,
      text: `Mã đặt lại mật khẩu của bạn là: ${otp}`,
      html: htmlContent
    });

    return {
      ok: true,
      messageId: info.messageId,
      message: 'Đã gửi mã đặt lại mật khẩu qua email.'
    };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi gửi email: ${err.message}`
    };
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  createTransporter,
  testSmtpConnection,
  sendVerificationEmail,
  sendPasswordResetEmail
};
