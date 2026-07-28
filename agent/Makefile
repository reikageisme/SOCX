# Makefile cho Aegis SOC eBPF Agent

ARCH := $(shell uname -m | sed 's/x86_64/x86/' | sed 's/aarch64/arm64/')
CLANG := clang
LLC := llc
BPFTOOL := bpftool

INCLUDES := -I./src
CFLAGS := -g -Wall -O2 $(INCLUDES)
LDFLAGS := -lbpf -lcurl -lelf -lz

SRC_DIR := ./src
OBJ_DIR := ./obj
BIN_DIR := ./bin

TARGET := $(BIN_DIR)/network_monitor
BPF_OBJ := $(OBJ_DIR)/network_monitor.bpf.o
SKEL_H := $(SRC_DIR)/network_monitor.skel.h
VMLINUX_H := $(SRC_DIR)/vmlinux.h

all: $(TARGET)

$(OBJ_DIR) $(BIN_DIR):
	mkdir -p $@

# 1. Tạo vmlinux.h từ kernel hiện tại để hỗ trợ CO-RE
$(VMLINUX_H):
	$(BPFTOOL) btf dump file /sys/kernel/btf/vmlinux format c > $@

# 2. Biên dịch mã BPF thành object
$(BPF_OBJ): $(SRC_DIR)/network_monitor.bpf.c $(VMLINUX_H) $(SRC_DIR)/network_monitor.h | $(OBJ_DIR)
	$(CLANG) -g -O2 -target bpf -D__TARGET_ARCH_$(ARCH) $(INCLUDES) -c $< -o $@

# 3. Tạo skeleton header từ BPF object
$(SKEL_H): $(BPF_OBJ)
	$(BPFTOOL) gen skeleton $< > $@

# 4. Biên dịch userspace loader
$(TARGET): $(SRC_DIR)/network_monitor.c $(SKEL_H) | $(BIN_DIR)
	$(CC) $(CFLAGS) $< -o $@ $(LDFLAGS)

clean:
	rm -rf $(OBJ_DIR) $(BIN_DIR) $(SKEL_H) $(VMLINUX_H)

.PHONY: all clean
