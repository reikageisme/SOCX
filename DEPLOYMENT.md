# ACS Deployment Guide (Proxmox VE)

Tài liệu hướng dẫn triển khai hệ thống phần mềm ACE Cyber Security (ACS) trên máy chủ ảo hóa Proxmox VE bằng kiến trúc Container (LXC/VM) và Docker Compose.

## 1. Yêu Cầu Hệ Thống Kiến Trúc
- **Không chạy trực tiếp** bất kỳ dịch vụ, database hay web server nào trên hệ điều hành host của Proxmox.
- **Tạo 1 LXC (Linux Container)** hoặc **VM Ubuntu/Debian** trên Proxmox với cấu hình khuyến nghị:
  - CPU: 4 Cores
  - RAM: 8GB (Dành cho CSDL và AI model nhỏ)
  - Disk: 50GB
  - Cài đặt sẵn: `docker`, `docker-compose`, `git`, `openssl`.

## 2. Các Bước Triển Khai

### 2.1. Clone Code 
Truy cập vào LXC/VM vừa tạo, dùng quyền user (có sudo) hoặc root:
```bash
git clone https://github.com/reikageisme/SOCX.git /opt/acs
cd /opt/acs
```

### 2.2. Thiết lập Biến Môi Trường (Mật Khẩu & API Keys)
Hệ thống KHÔNG lưu trữ API keys trong code. Bạn cần tự thiết lập file cấu hình:
```bash
cp backend/.env.example backend/.env
```
Mở file `backend/.env` bằng trình soạn thảo (nano/vim) và điền các giá trị thực:
```env
MOCK_PROXMOX=False
OTX_API_KEY=your_real_key_here
THREATFOX_API_KEY=your_real_key_here
ABUSEIPDB_API_KEY=your_real_key_here
MAXMIND_LICENSE_KEY=your_real_key_here

# Chọn "ollama" cho bảo mật nội bộ, hoặc "gemini" nếu muốn dùng AI đám mây
AI_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
GEMINI_API_KEY=
```
*(Tuyệt đối không chạy lệnh `git add backend/.env`, file này đã được ignore an toàn).*

### 2.3. Khởi Chạy Hệ Thống Bằng Chế Độ Production
Chạy file script triển khai tự động. Script sẽ tự tạo chứng chỉ SSL (Self-signed) cho kết nối HTTPS an toàn trong mạng nội bộ LAN, và khởi động hệ thống.
```bash
chmod +x deploy.sh
./deploy.sh
```

Hệ thống sẽ tải image, build frontend và bật 3 container (`acs-backend`, `acs-frontend`, `acs-proxy`).

## 3. Cấu Hình eBPF Agent

Một vấn đề quan trọng là vị trí cài đặt **Sensor thu thập gói tin (eBPF Agent)**.
- Theo Best Practice, bạn **KHÔNG NÊN** cài agent lên tầng Host Proxmox trừ khi bắt buộc. 
- Hãy copy thư mục `agent/` sang các máy ảo (VM) mà bạn muốn giám sát luồng dữ liệu, cài đặt Python và chạy agent ở bên trong từng máy ảo độc lập đó.

## 4. Quản Trị & Rollback

### Xem Log
- Xem toàn bộ hệ thống: `docker compose -f docker-compose.prod.yml logs -f`
- Xem Backend: `docker logs -f acs-backend`

### Cập Nhật Phiên Bản Mới
Khi có commit mới trên nhánh `main`:
```bash
git pull origin main
./deploy.sh
```

### Rollback (Trở về bản cũ)
Nếu bản deploy mới bị lỗi không mong muốn:
```bash
# Xem lịch sử các commit:
git log --oneline

# Checkout về commit ổn định (ví dụ: abcd123)
git checkout abcd123
./deploy.sh
```
