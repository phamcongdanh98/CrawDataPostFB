# 🚀 HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG LÊN CLOUD & PRODUCTION

Tài liệu này hướng dẫn chi tiết cách đưa ứng dụng **Facebook Fanpage Insight & Crawler** lên máy chủ thực tế (Production) hoặc các nền tảng đám mây miễn phí / chi phí thấp.

---

## 📑 MỤC LỤC
1. [Triển khai bằng Docker & Docker Compose (Khuyên dùng trên VPS)](#1-triển-khai-bằng-docker--docker-compose-khuyên-dùng)
2. [Triển khai miễn phí lên Render.com](#2-triển-khai-miễn-phí-lên-rendercom)
3. [Triển khai lên Railway.app](#3-triển-khai-lên-railwayapp)
4. [Lưu ý quan trọng về Dữ liệu bền vững (Persistence)](#4-lưu-ý-quan-trọng-về-dữ-liệu-bền-vững)

---

## 1. Triển khai bằng Docker & Docker Compose (Khuyên dùng)

Phương thức tối ưu và ổn định nhất cho ứng dụng có sử dụng trình duyệt Playwright và cơ sở dữ liệu SQLite cục bộ.

### Yêu cầu cấu hình VPS:
- **Hệ điều hành**: Ubuntu 22.04 LTS hoặc Debian 12
- **RAM**: Tối thiểu 1GB (Khuyên dùng 2GB để chạy mượt mà nhiều luồng Chromium song song)
- **Dung lượng đĩa**: 10GB SSD trở lên

### Các bước thực hiện:

#### Bước 1: Cài đặt Docker & Docker Compose trên VPS
```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Cài đặt Docker Compose plugin
sudo apt install -y docker-compose-plugin
```

#### Bước 2: Clone mã nguồn từ GitHub về VPS
```bash
git clone https://github.com/phamcongdanh98/CrawDataPostFB.git
cd CrawDataPostFB
```

#### Bước 3: Tạo tệp cấu hình môi trường `.env`
```bash
cp .env.example .env
nano .env
```
Điền các giá trị quan trọng:
- `FB_PAGE_ID`: ID Fanpage mặc định
- `FB_PAGE_ACCESS_TOKEN`: Token trang vĩnh viễn (hoặc cấu hình sau trên giao diện Web)
- `ADMIN_EMAIL` & `ADMIN_PASSWORD`: Tài khoản quản trị cao nhất

#### Bước 4: Khởi chạy container ngầm bằng Docker Compose
```bash
# Build image và chạy nền
docker compose up -d --build

# Kiểm tra trạng thái container
docker compose ps

# Xem log hoạt động theo thời gian thực
docker compose logs -f
```

Ứng dụng của bạn sẽ hoạt động tại địa chỉ: `http://<IP_VPS_CỦA_BẠN>:3000`.

---

## 2. Triển khai miễn phí lên Render.com

Render cung cấp gói Web Service miễn phí (Free Tier) hỗ trợ Docker container.

### Các bước thực hiện:
1. Đăng ký / Đăng nhập tài khoản tại [Render.com](https://render.com/).
2. Bấm nút **New +** -> Chọn **Web Service**.
3. Kết nối với kho mã nguồn GitHub repository của bạn: `phamcongdanh98/CrawDataPostFB`.
4. Thiết lập thông số:
   - **Name**: `fb-fanpage-insight`
   - **Language / Runtime**: Chọn **Docker** (Render sẽ tự động đọc `Dockerfile` của dự án).
   - **Region**: Singapore (ưu tiên gần Việt Nam để tốc độ tải nhanh nhất).
   - **Instance Type**: Chọn gói **Free** (hoặc Starter $7/tháng nếu muốn không bị ngủ đông).
5. Phần **Environment Variables**, thêm các biến cần thiết:
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
   - `FB_PAGE_ID`: ID trang của bạn
   - `FB_PAGE_ACCESS_TOKEN`: Token trang
   - `ADMIN_EMAIL`: Email quản trị
   - `ADMIN_PASSWORD`: Mật khẩu quản trị
6. Bấm **Create Web Service**. Render sẽ tự động build image và cấp đường dẫn HTTPS miễn phí (ví dụ: `https://fb-fanpage-insight.onrender.com`).

---

## 3. Triển khai lên Railway.app

Railway là nền tảng đám mây hiện đại hỗ trợ khởi chạy Docker và cấp bộ nhớ Persistent Disk rất thuận tiện cho SQLite.

### Các bước thực hiện:
1. Truy cập [Railway.app](https://railway.app/) và đăng nhập bằng tài khoản GitHub.
2. Bấm **New Project** -> Chọn **Deploy from GitHub repo**.
3. Chọn repo `phamcongdanh98/CrawDataPostFB`.
4. Railway sẽ tự động phát hiện `Dockerfile` và bắt đầu build.
5. Trong phần **Variables**, thêm các biến môi trường tương tự như file `.env`.
6. (Khuyên dùng) Trong thẻ **Settings** -> **Volumes**, bấm **Add Volume** và gắn mount path vào `/app/data` để lưu trữ cơ sở dữ liệu SQLite vĩnh viễn không bị xóa khi deploy phiên bản mới.
7. Vào mục **Settings** -> **Networking** -> Bấm **Generate Domain** để nhận đường link truy cập công khai miễn phí.

---

## 4. Lưu ý quan trọng về Dữ liệu bền vững

| Thành phần | Mục đích | Cách duy trì khi Deploy |
| :--- | :--- | :--- |
| `data/facebook-stat.sqlite` | Lưu toàn bộ bài viết, tương tác, tài khoản, fanpages | Mount thư mục `./data:/app/data` (đã cấu hình sẵn trong `docker-compose.yml`) |
| `auth_profile/` | Lưu cookie phiên đăng nhập Playwright | Mount thư mục `./auth_profile:/app/auth_profile` |
| `.env` | Lưu cấu hình kết nối Facebook API và SMTP | Đặt trong thư mục gốc hoặc qua bảng điều khiển Cloud |

---

> 💡 **Mẹo bảo mật**: Luôn đổi mật khẩu tài khoản Admin mặc định sau khi đưa lên Internet và kích hoạt chế độ HTTPS qua Cloudflare hoặc Nginx Reverse Proxy.
