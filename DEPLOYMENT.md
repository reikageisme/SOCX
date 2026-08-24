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


## Trang Infrastructure (giám sát + quản trị host)

Trang `/infrastructure` hiển thị 4 vòng tròn tài nguyên (dung lượng đĩa, CPU, RAM,
băng thông), các nhóm "Tài nguyên khác" và bảng node/VM/LXC có nút điều khiển.
Dữ liệu được đẩy trực tiếp qua WebSocket `\`/api/v1/ws/infrastructure?token=<JWT>\``
theo chu kỳ `INFRA_POLL_SECONDS` (mặc định 5 giây), kèm fallback REST
`\`GET /api/v1/proxmox/overview\``.

### Quyền cần cấp cho API token Proxmox

Token khai báo trong `PROXMOX_TOKEN_ID` / `PROXMOX_TOKEN_SECRET` cần các quyền sau
trên đường dẫn `/` (hoặc tối thiểu `/nodes` và `/storage`):

| Quyền | Dùng cho |
|-------|----------|
| `Sys.Audit` | `/nodes/{node}/status`, `services`, `certificates`, `apt/update`, `replication` |
| `VM.Audit` | Danh sách và chỉ số của VM/LXC |
| `Datastore.Audit` | Dung lượng các storage pool |
| `VM.PowerMgmt` | Nút khởi động / tắt / khởi động lại VM (chỉ vai trò quản trị) |

Nếu token thiếu quyền, các chỉ số tương ứng trả về 0 hoặc rỗng thay vì làm hỏng trang —
kiểm tra log backend với tiền tố `[proxmox]` để biết endpoint nào bị từ chối.

### Ghi chú

- CT100 (host chạy chính nền tảng ACS) bị chặn mọi thao tác tắt/khởi động lại/cách ly từ UI.
- Cảnh báo mức nghiêm trọng tự động tạo incident `[Hạ tầng] ...` trong module Incidents,
  có debounce 30 phút để tránh trùng lặp.
- `NET_LINK_MBPS` chỉ là giá trị giả định để quy đổi phần trăm băng thông; đặt đúng tốc độ
  uplink thực tế của node để vòng tròn phản ánh chính xác.


## Sensor Agent — nhiệt độ, SMART, điều khiển quạt

Nhiệt độ và quạt nằm ở tầng phần cứng của Proxmox host. Container **không đọc được**
`/sys/class/hwmon` của host, và kể cả privileged LXC cũng không ghi được vào đó
(sysfs mount read-only, hwmon toàn symlink trỏ về `/sys/devices/...`). Vì vậy phần
này chạy bằng một agent riêng **trên host**, không phải trong CT.

### Cài đặt (chạy trên host pve)

```bash
cd /root && git clone https://github.com/reikageisme/SOCX.git socx-agent
bash socx-agent/agent/install-sensor-agent.sh https://<IP-CT-SOC> <INTERNAL_API_KEY>
```

`INTERNAL_API_KEY` phải trùng giá trị trong `backend/.env`.

### Kiểm tra trước khi cài

```bash
python3 agent/sensor_discovery.py
```

Dòng `[3] Dieu khien` cho biết bo mạch có cho chỉnh quạt hay không.

### Khả năng theo từng loại bo mạch

| Bo mạch | Đọc nhiệt | Đọc RPM | Chỉnh quạt |
|---|---|---|---|
| Có chip Super I/O (nct6775, it87…) | ✓ | ✓ | PWM 0–255 |
| HP ProDesk / EliteDesk Mini (`hp-wmi`) | ✓ | ✗ | Chỉ hai nấc: BIOS auto / tối đa |
| Server có IPMI | ✓ | ✓ | Cần lệnh raw riêng từng hãng (chưa hỗ trợ) |
| Không có gì | ✓ (coretemp) | ✗ | ✗ |

### Nguyên tắc an toàn

- Vòng điều khiển nằm trọn trên host. Mất mạng hay backend chết thì bảo vệ quá nhiệt
  vẫn chạy bằng chính sách lưu tại `/var/lib/aegis-sensor-agent/policy.json`.
- Cơ chế tự động **chỉ được phép làm mát mạnh hơn**. Không tồn tại đường nào cho phép
  phần mềm hạ quạt xuống trong lúc nhiệt đang cao.
- Mọi đường thoát (systemctl stop, Ctrl-C, crash) đều trả quạt về cho BIOS.
- Ngưỡng nhận từ backend được chặn vào khoảng an toàn 45–95°C trước khi áp dụng, và
  ngưỡng tắt luôn bị ép thấp hơn ngưỡng bật ít nhất 3°C để quạt không bật tắt liên tục.

### Vận hành

```bash
systemctl status aegis-sensor-agent
journalctl -u aegis-sensor-agent -f
python3 /usr/local/bin/aegis-sensor-agent.py --once      # in một lần rồi thoát
python3 /usr/local/bin/aegis-sensor-agent.py --once --dry-run
```

### API liên quan

| Endpoint | Xác thực | Công dụng |
|---|---|---|
| `POST /api/v1/sensors/ingest` | `X-API-Key` | Agent gửi số liệu, nhận lại chính sách quạt |
| `GET /api/v1/sensors/latest` | JWT | Số liệu mới nhất |
| `GET /api/v1/sensors/history?minutes=180` | JWT | Chuỗi thời gian (ghi mỗi 60s, giữ 7 ngày) |
| `GET /api/v1/sensors/policy` | JWT | Đọc chính sách |
| `PUT /api/v1/sensors/policy` | JWT (quản trị) | Đổi chế độ và ngưỡng |
