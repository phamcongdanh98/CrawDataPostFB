const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(ROOT_DIR, 'data');
const DEBUG_DIR = path.resolve(ROOT_DIR, 'debug');
const DB_PATH = path.resolve(DATA_DIR, 'facebook-stat.sqlite');

// Đảm bảo các thư mục cần thiết tồn tại
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

function reloadEnv() {
  const envPath = path.resolve(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        process.env[k] = v;
      }
    } catch (e) {
      console.warn('[Config] Không thể reload .env:', e.message);
    }
  }
}

/**
 * Cập nhật tập trung và an toàn các biến cấu hình vào file .env
 * @param {Object} updates - Các cặp { KEY: VALUE }
 */
function updateEnvConfig(updates = {}) {
  const envPath = path.resolve(ROOT_DIR, '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) continue;
    const strVal = String(value).trim();
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${strVal}`);
    } else {
      envContent = envContent.trim() + `\n${key}=${strVal}\n`;
    }
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
  reloadEnv();
  return true;
}

const config = {
  ROOT_DIR,
  DATA_DIR,
  DEBUG_DIR,
  DB_PATH,
  reloadEnv,
  updateEnvConfig,
  get FB_PAGE_ID() {
    return (process.env.FB_PAGE_ID || '').trim();
  },
  get FB_PAGE_ACCESS_TOKEN() {
    return (process.env.FB_PAGE_ACCESS_TOKEN || '').trim();
  },
  get PORT() {
    return parseInt(process.env.PORT, 10) || 3000;
  },
  get FB_GRAPH_VERSION() {
    return (process.env.FB_GRAPH_VERSION || 'v26.0').trim();
  },
  get FB_PROFILE_DIR() {
    return path.resolve(ROOT_DIR, process.env.FB_PROFILE_DIR || './fb-profile');
  },
  get FB_HEADLESS() {
    if (process.env.FB_HEADLESS !== undefined) {
      return process.env.FB_HEADLESS !== 'false';
    }
    return true; // Mặc định chạy ẩn để tối ưu tốc độ và không làm phiền người dùng
  },
  get FB_CONCURRENCY() {
    return Math.min(16, Math.max(1, parseInt(process.env.FB_CONCURRENCY, 10) || 4));
  },
  get FB_DELAY_MIN_MS() {
    return Math.max(10, parseInt(process.env.FB_DELAY_MIN_MS, 10) || 50);
  },
  get FB_DELAY_MAX_MS() {
    return Math.max(30, parseInt(process.env.FB_DELAY_MAX_MS, 10) || 150);
  },
  get FB_MAX_RETRIES() {
    return Math.max(1, parseInt(process.env.FB_MAX_RETRIES, 10) || 3);
  },
  get TZ() {
    return process.env.TZ || 'Asia/Ho_Chi_Minh';
  },

  isApiConfigured() {
    return Boolean(this.FB_PAGE_ID && this.FB_PAGE_ACCESS_TOKEN);
  },

  isProfilePresent() {
    return fs.existsSync(this.FB_PROFILE_DIR);
  }
};

module.exports = config;
