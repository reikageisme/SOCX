#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_core_read.h>
#include <bpf/bpf_tracing.h>
#include "network_monitor.h"

char LICENSE[] SEC("license") = "GPL";

/* Ring buffer to pass data to userspace */
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 256 * 1024);
} rb SEC(".maps");

/* 
 * kprobe for tcp_v4_connect
 * This function is called when a TCP IPv4 connection is initiated.
 */
SEC("kprobe/tcp_v4_connect")
int BPF_KPROBE(tcp_v4_connect, struct sock *sk)
{
    struct event *e;
    struct inet_sock *inet;
    unsigned short dport;
    
    if (!sk)
        return 0;

    /* Read destination port. 
     * dport is stored in network byte order in inet_sock 
     */
    inet = (struct inet_sock *)sk;
    BPF_CORE_READ_INTO(&dport, inet, inet_dport);
    
    /* Convert to host byte order for easier filtering */
    dport = __builtin_bswap16(dport);
    
    /* Filter: Only alert on MongoDB (27017), HTTP (80), HTTPS (443) */
    if (dport != 27017 && dport != 80 && dport != 443) {
        return 0;
    }

    /* Reserve space in ring buffer */
    e = bpf_ringbuf_reserve(&rb, sizeof(*e), 0);
    if (!e)
        return 0;

    e->pid = bpf_get_current_pid_tgid() >> 32;
    e->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    e->dport = dport;

    /* Read source and destination IPs */
    BPF_CORE_READ_INTO(&e->saddr, inet, inet_saddr);
    BPF_CORE_READ_INTO(&e->daddr, sk, __sk_common.skc_daddr);

    /* Get command name (process name) */
    bpf_get_current_comm(&e->comm, sizeof(e->comm));

    /* Submit event to ring buffer */
    bpf_ringbuf_submit(e, 0);

    return 0;
}
