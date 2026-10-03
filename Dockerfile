# Sử dụng Node.js 20 LTS nền tảng Debian Bookworm
FROM node:20-bookworm-slim

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Cài đặt các gói hệ thống cần thiết cho Playwright Chromium headless và nén dữ liệu
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Sao chép package.json và cài đặt dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Cài đặt trình duyệt Playwright Chromium
RUN npx playwright install chromium

# Sao chép toàn bộ mã nguồn ứng dụng
COPY . .

# Tạo các thư mục lưu trữ dữ liệu bền vững
RUN mkdir -p data auth_profile

# Mở cổng 3000 cho web server
EXPOSE 3000

# Biến môi trường mặc định
ENV NODE_ENV=production \
    PORT=3000

# Lệnh khởi động server
CMD ["node", "src/server.js"]
