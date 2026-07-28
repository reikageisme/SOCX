FROM ubuntu:22.04

# Cài đặt BCC, python3, linux-headers và các dependency eBPF
RUN apt-get update && apt-get install -y \
    bpfcc-tools \
    linux-headers-generic \
    python3-bpfcc \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY aegis_ebpf_agent.py .

# CẢNH BÁO BẢO MẬT: Container này cần quyền truy cập kernel HOST để chạy eBPF!
# Yêu cầu chạy với: --privileged hoặc cấp --cap-add=SYS_ADMIN --cap-add=BPF --cap-add=PERFMON --cap-add=SYS_RESOURCE
# và mount /sys/kernel/debug:/sys/kernel/debug:rw
CMD ["python3", "-u", "aegis_ebpf_agent.py", "--backend-url", "http://backend:8000/api/v1/events/network"]
