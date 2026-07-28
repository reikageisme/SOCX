#ifndef __NETWORK_MONITOR_H
#define __NETWORK_MONITOR_H

#define TASK_COMM_LEN 16

/* Structure to be passed from kernel to userspace via BPF ring buffer */
struct event {
    unsigned int pid;
    unsigned int uid;
    unsigned int saddr;
    unsigned int daddr;
    unsigned short dport;
    char comm[TASK_COMM_LEN];
};

#endif /* __NETWORK_MONITOR_H */
