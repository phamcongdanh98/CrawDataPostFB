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

const config = {
  ROOT_DIR,
  DATA_DIR,
  DEBUG_DIR,
  DB_PATH,
  FB_PAGE_ID: (process.env.FB_PAGE_ID || '').trim(),
  FB_PAGE_ACCESS_TOKEN: (process.env.FB_PAGE_ACCESS_TOKEN || '').trim(),
  PORT: parseInt(process.env.PORT, 10) || 3000,
  FB_GRAPH_VERSION: (process.env.FB_GRAPH_VERSION || 'v26.0').trim(),
  FB_PROFILE_DIR,
  FB_HEADLESS: process.env.FB_HEADLESS === 'true',
  FB_CONCURRENCY: Math.min(4, Math.max(1, parseInt(process.env.FB_CONCURRENCY, 10) || 2)),
  FB_DELAY_MIN_MS: Math.max(500, parseInt(process.env.FB_DELAY_MIN_MS, 10) || 1500),
  FB_DELAY_MAX_MS: Math.max(1000, parseInt(process.env.FB_DELAY_MAX_MS, 10) || 3500),
  FB_MAX_RETRIES: Math.max(1, parseInt(process.env.FB_MAX_RETRIES, 10) || 2),
  TZ: process.env.TZ || 'Asia/Ho_Chi_Minh',

  isApiConfigured() {
    return Boolean(this.FB_PAGE_ID && this.FB_PAGE_ACCESS_TOKEN);
  },

  isProfilePresent() {
    return fs.existsSync(this.FB_PROFILE_DIR);
  }
};

module.exports = config;
