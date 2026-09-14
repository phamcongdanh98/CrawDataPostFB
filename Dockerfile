# Sử dụng Node.js 20 trên nền Debian Bookworm ổn định
FROM node:20-bookworm-slim

# Thiết lập thư mục làm việc
WORKDIR /app

# Cài đặt các công cụ biên dịch C++ cho thư viện better-sqlite3 và curl kiểm tra health
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files và cài đặt dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Cài đặt Playwright Chromium và toàn bộ thư viện Linux hệ thống cần thiết tự động
RUN npx playwright install --with-deps chromium

# Copy toàn bộ mã nguồn
COPY . .

# Tạo thư mục lưu trữ SQLite và Facebook profile
RUN mkdir -p /app/data /app/fb_profile

# Thiết lập quyền và biến môi trường
ENV NODE_ENV=production \
    PORT=3000 \
    FB_HEADLESS=true \
    TZ=Asia/Ho_Chi_Minh

# Mở cổng ứng dụng
EXPOSE 3000

# Kiểm tra trạng thái máy chủ (Healthcheck)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Lệnh khởi chạy ứng dụng
CMD ["npm", "start"]
