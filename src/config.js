const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(ROOT_DIR, 'data');
const DEBUG_DIR = path.resolve(ROOT_DIR, 'debug');
const FB_PROFILE_DIR = path.resolve(ROOT_DIR, process.env.FB_PROFILE_DIR || './fb-profile');
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

const config = {
  ROOT_DIR,
  DATA_DIR,
  DEBUG_DIR,
  DB_PATH,
  reloadEnv,
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
    return process.env.FB_HEADLESS === 'true';
  },
  get FB_CONCURRENCY() {
    return Math.min(4, Math.max(1, parseInt(process.env.FB_CONCURRENCY, 10) || 2));
  },
  get FB_DELAY_MIN_MS() {
    return Math.max(500, parseInt(process.env.FB_DELAY_MIN_MS, 10) || 1500);
  },
  get FB_DELAY_MAX_MS() {
    return Math.max(1000, parseInt(process.env.FB_DELAY_MAX_MS, 10) || 3500);
  },
  get FB_MAX_RETRIES() {
    return Math.max(1, parseInt(process.env.FB_MAX_RETRIES, 10) || 2);
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
