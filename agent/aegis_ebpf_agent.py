#!/usr/bin/env python3
# Aegis SOC - eBPF Agent (BCC Version)
# Run with: sudo python3 aegis_ebpf_agent.py

from bcc import BPF
import argparse
import ctypes
import time
import requests
import json
from datetime import datetime, timezone
import socket
import struct

# --- CLI Arguments ---
parser = argparse.ArgumentParser(description="Aegis SOC eBPF Agent")
parser.add_argument("--backend-url", type=str, default="http://127.0.0.1:8000/api/v1/events/network",
                    help="URL of the Aegis SOC backend API")
parser.add_argument("--dest-port-filter", type=int, default=0,
                    help="Only log connections to this destination port (default: 0 = all ports)")
args = parser.parse_args()

import os
MY_PID = os.getpid()

# --- eBPF C Code ---
bpf_text = """
#include <uapi/linux/ptrace.h>

#define AF_INET 2
#define IPPROTO_TCP 6
#define TCP_SYN_SENT 2
#define TASK_COMM_LEN 16

BPF_PERF_OUTPUT(ipv4_events);

struct ipv4_data_t {
    u64 ts_us;
    u32 pid;
    u32 uid;
    u32 saddr;
    u32 daddr;
    u16 dport;
    char task[TASK_COMM_LEN];
};

TRACEPOINT_PROBE(sock, inet_sock_set_state) {
    if (args->protocol != IPPROTO_TCP) return 0;
    if (args->family != AF_INET) return 0;
    
    // TCP_SYN_SENT == 2 (Bắt đầu kết nối outbound)
    if (args->newstate != 2) return 0;

    // Bỏ qua kết nối của chính eBPF Agent để tránh vòng lặp vô hạn
    u32 pid = bpf_get_current_pid_tgid() >> 32;
    if (pid == MY_PID_FILTER) return 0;

    struct ipv4_data_t data4 = {};
    data4.ts_us = bpf_ktime_get_ns() / 1000;
    data4.pid = pid;
    data4.uid = bpf_get_current_uid_gid();
    
    // Đọc địa chỉ từ tracepoint args (saddr và daddr là mảng 4 bytes)
    __builtin_memcpy(&data4.saddr, args->saddr, 4);
    __builtin_memcpy(&data4.daddr, args->daddr, 4);
    data4.dport = args->dport;
    
    bpf_get_current_comm(&data4.task, sizeof(data4.task));

    // Lọc theo port nếu có
    u16 filter_port = FILTER_PORT;
    if (filter_port != 0 && data4.dport != filter_port) {
        return 0;
    }

    ipv4_events.perf_submit(args, &data4, sizeof(data4));
    return 0;
}
"""

# Apply filters
bpf_text = bpf_text.replace("FILTER_PORT", str(args.dest_port_filter))
bpf_text = bpf_text.replace("MY_PID_FILTER", str(MY_PID))

# --- Initialize BPF ---
print(f"[*] Compiling eBPF program (Target port: {'ALL' if args.dest_port_filter == 0 else args.dest_port_filter})...")
b = BPF(text=bpf_text)

# Define the event struct in Python
class Data_ipv4(ctypes.Structure):
    _fields_ = [
        ("ts_us", ctypes.c_uint64),
        ("pid", ctypes.c_uint32),
        ("uid", ctypes.c_uint32),
        ("saddr", ctypes.c_uint32),
        ("daddr", ctypes.c_uint32),
        ("dport", ctypes.c_uint16),
        ("task", ctypes.c_char * 16)
    ]

def int_to_ip(addr):
    return socket.inet_ntoa(struct.pack("I", addr))

print(f"[*] Aegis SOC eBPF Agent running...")
print(f"[*] Sending events to: {args.backend_url}")
print(f"[*] Press Ctrl+C to stop.")

# --- Event Callback ---
def print_ipv4_event(cpu, data, size):
    event = ctypes.cast(data, ctypes.POINTER(Data_ipv4)).contents
    
    # Format data
    timestamp = datetime.now(timezone.utc).isoformat()
    process = event.task.decode('utf-8', 'replace')
    saddr = int_to_ip(event.saddr)
    daddr = int_to_ip(event.daddr)
    
    # Print locally
    print(f"[{timestamp}] {process} (pid={event.pid}) {saddr} -> {daddr}:{event.dport}")
    
    # Prepare JSON payload
    payload = {
        "event_type": "network_connect",
        "pid": event.pid,
        "process": process,
        "source_ip": saddr,
        "dest_ip": daddr,
        "dest_port": event.dport,
        "timestamp": timestamp
    }
    
    # Send to Backend (Non-blocking or fast-fire for demo)
    try:
        requests.post(args.backend_url, json=payload, timeout=2)
    except Exception as e:
        print(f"[!] Failed to send event to backend: {e}")

# Read events from kernel perf ring buffer
b["ipv4_events"].open_perf_buffer(print_ipv4_event)

try:
    while True:
        try:
            b.perf_buffer_poll()
        except KeyboardInterrupt:
            exit()
except Exception as e:
    print(f"Error: {e}")
