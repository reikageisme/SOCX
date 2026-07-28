# Aegis SOC - eBPF Data Plane Agent

Đây là Agent chạy ở tầng kernel sử dụng eBPF (libbpf + CO-RE) để thu thập log TCP Connect ra các cổng nhạy cảm (như MongoDB 27017, HTTP 80/443).
Thiết kế CO-RE (Compile Once, Run Everywhere) giúp agent này có thể chạy trên nhiều bản kernel khác nhau của Ubuntu mà không cần cài LLVM/Clang trên máy production.

## ⚠️ CẢNH BÁO BẢO MẬT TRƯỚC KHI DEPLOY

> [!WARNING]
> **Rủi Ro Hệ Thống**: Dù eBPF có BPF Verifier kiểm tra an toàn, việc load chương trình vào kernel luôn có tỷ lệ rủi ro nhỏ. LUÔN test trên một máy ảo (VM) có cùng OS/Kernel với server Proxmox trước khi deploy thật.
> **Tuyệt đối không chạy lệnh `make` hoặc `./network_monitor` trực tiếp trên Server Proxmox lúc này!**

## Checklist an toàn (Trước khi đưa lên Production)

- [ ] Bạn đã chạy test thành công trên VM (Vagrant/Multipass) độc lập?
- [ ] Kernel version của VM và Proxmox Server là tương đương nhau (>= 5.15)?
- [ ] Backend FastAPI đã mở mạng cho Agent giao tiếp mTLS?
- [ ] Các cảnh báo về quyền `CAP_BPF` và `CAP_PERFMON` đã được lưu ý thay vì cấp full root.

## Yêu cầu Hệ thống (Môi trường Build/Test VM)

1. Hệ điều hành: Ubuntu 20.04 (Hạn chế) hoặc Ubuntu 22.04+ (Khuyến nghị).
2. Yêu cầu Kernel >= 5.8 (để dùng Ring Buffer và `CAP_BPF`).

### 1. Cài đặt các gói phụ thuộc để Build
```bash
sudo apt-get update
sudo apt-get install -y clang llvm libelf-dev libpcap-dev libbpf-dev linux-tools-$(uname -r) bpftool libcurl4-openssl-dev make
```

### 2. Biên dịch (Build)
Chạy lệnh `make` trong thư mục `agent/`:
```bash
make
```
Quá trình này sẽ:
1. Dùng `bpftool` sinh ra `vmlinux.h` (Header chứa cấu trúc kernel hiện hành).
2. Biên dịch `.bpf.c` thành BPF object `.o`.
3. Sinh ra skeleton `.skel.h`.
4. Biên dịch Userspace program bằng `gcc` và link với `libcurl`, `libbpf`.

Kết quả thu được là file thực thi: `bin/network_monitor`.

### 3. Hướng dẫn Test Cô Lập

1. Khởi động backend FastAPI trên máy host (đảm bảo đang chạy).
2. Chuyển file thực thi `bin/network_monitor` vào máy ảo (nếu bạn build trên máy host).
3. Đảm bảo IP/URL của Backend trong file `src/network_monitor.c` (`BACKEND_URL`) là chính xác so với vị trí VM.
4. Chạy Agent trên VM:
   ```bash
   sudo ./bin/network_monitor
   ```
5. Mở một terminal khác trên VM, thử kết nối tới 1 trang web hoặc MongoDB:
   ```bash
   curl http://example.com
   # Hoặc 
   telnet localhost 27017
   ```
6. Bạn sẽ thấy dòng log in ra trên console của agent, và ngay lập tức giao diện React (Frontend) sẽ nhảy Alert!

## Cấu trúc dữ liệu sự kiện (JSON)

Dữ liệu agent gửi lên Backend có định dạng:
```json
{
  "pid": 1234,         // Process ID của tiến trình gọi kết nối
  "uid": 1000,         // User ID của tiến trình
  "comm": "curl",      // Tên tiến trình (command)
  "saddr": "10.0.2.15",// IP Nguồn (Source IP)
  "daddr": "93.184.216.34", // IP Đích (Dest IP)
  "dport": 80          // Port Đích (Dest Port)
}
```
Định dạng này cực kỳ nhỏ gọn, không capture toàn bộ payload dữ liệu (chỉ bắt metadata TCP Connect) nhằm giữ overhead ở mức tiệm cận 0.
