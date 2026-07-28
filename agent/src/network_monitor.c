#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <arpa/inet.h>
#include <curl/curl.h>
#include <bpf/libbpf.h>
#include <sys/capability.h>
#include "network_monitor.h"
#include "network_monitor.skel.h"

static volatile bool exiting = false;

/* Configuration for Backend */
#define BACKEND_URL "http://127.0.0.1:8000/api/v1/agent/events"
#define API_KEY "aegis-dev-key"

static void sig_handler(int sig)
{
    exiting = true;
}

/* Function to send event to FastAPI backend */
static void send_event_to_backend(const struct event *e)
{
    CURL *curl;
    CURLcode res;
    char saddr_str[INET_ADDRSTRLEN];
    char daddr_str[INET_ADDRSTRLEN];
    char json_payload[512];
    struct curl_slist *headers = NULL;

    inet_ntop(AF_INET, &e->saddr, saddr_str, sizeof(saddr_str));
    inet_ntop(AF_INET, &e->daddr, daddr_str, sizeof(daddr_str));

    snprintf(json_payload, sizeof(json_payload),
             "{"
             "\"pid\": %u,"
             "\"uid\": %u,"
             "\"comm\": \"%s\","
             "\"saddr\": \"%s\","
             "\"daddr\": \"%s\","
             "\"dport\": %u"
             "}",
             e->pid, e->uid, e->comm, saddr_str, daddr_str, e->dport);

    curl = curl_easy_init();
    if (curl) {
        headers = curl_slist_append(headers, "Content-Type: application/json");
        
        /* 
         * Note: For Phase 2, we simulate mTLS using simple HTTPS/HTTP + API Key.
         * Real mTLS involves configuring CURL context with client certs here:
         * curl_easy_setopt(curl, CURLOPT_SSLCERT, "agent.crt");
         * curl_easy_setopt(curl, CURLOPT_SSLKEY, "agent.key");
         * We use API Key just to make the demo runnable.
         */
        char auth_header[256];
        snprintf(auth_header, sizeof(auth_header), "X-API-Key: %s", API_KEY);
        headers = curl_slist_append(headers, auth_header);

        curl_easy_setopt(curl, CURLOPT_URL, BACKEND_URL);
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_payload);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 3L);
        
        // Disable verbose output in production
        // curl_easy_setopt(curl, CURLOPT_VERBOSE, 1L);

        /* Simple retry loop with exponential backoff */
        int retries = 3;
        int delay = 1; // seconds
        while (retries > 0) {
            res = curl_easy_perform(curl);
            if (res == CURLE_OK) {
                break;
            }
            fprintf(stderr, "Failed to send event: %s. Retrying in %ds...\n", curl_easy_strerror(res), delay);
            sleep(delay);
            delay *= 2;
            retries--;
        }

        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);
    }
}

/* Callback for Ring Buffer */
static int handle_event(void *ctx, void *data, size_t data_sz)
{
    const struct event *e = data;
    
    char saddr_str[INET_ADDRSTRLEN];
    char daddr_str[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &e->saddr, saddr_str, sizeof(saddr_str));
    inet_ntop(AF_INET, &e->daddr, daddr_str, sizeof(daddr_str));
    
    printf("[TCP Connect] PID: %-6u UID: %-5u COMM: %-16s %s -> %s:%d\n",
           e->pid, e->uid, e->comm, saddr_str, daddr_str, e->dport);

    send_event_to_backend(e);
    
    return 0;
}

/* 
 * Drop privileges but keep CAP_BPF and CAP_PERFMON 
 * (Warning: CAP_PERFMON/CAP_BPF is available in Linux 5.8+)
 * For this demo, we assume the user runs it with sudo/root.
 * In production, you'd use libcap to set specific capabilities and drop root.
 */
static void enforce_least_privilege() {
    // This is a placeholder for actual capset() calls.
    // E.g., cap_t caps = cap_get_proc(); cap_set_flag(... CAP_BPF, CAP_PERFMON); cap_set_proc(caps);
    printf("[Info] Running eBPF agent. Ensure kernel >= 5.8 for CAP_BPF.\n");
}

int main(int argc, char **argv)
{
    struct network_monitor_bpf *skel;
    struct ring_buffer *rb = NULL;
    int err;

    /* Set up libbpf errors and debug info callback */
    libbpf_set_print(NULL);
    
    /* Enforce least privilege logging */
    enforce_least_privilege();

    /* Set up signal handlers */
    signal(SIGINT, sig_handler);
    signal(SIGTERM, sig_handler);

    /* Initialize libcurl globally */
    curl_global_init(CURL_GLOBAL_ALL);

    /* Open and load BPF application */
    skel = network_monitor_bpf__open_and_load();
    if (!skel) {
        fprintf(stderr, "Failed to open and load BPF skeleton\n");
        return 1;
    }

    /* Attach tracepoints/kprobes */
    err = network_monitor_bpf__attach(skel);
    if (err) {
        fprintf(stderr, "Failed to attach BPF skeleton\n");
        goto cleanup;
    }

    /* Set up ring buffer polling */
    rb = ring_buffer__new(bpf_map__fd(skel->maps.rb), handle_event, NULL, NULL);
    if (!rb) {
        err = -1;
        fprintf(stderr, "Failed to create ring buffer\n");
        goto cleanup;
    }

    printf("Successfully started! Tracing TCP connections to port 80, 443, 27017...\n");
    printf("Press Ctrl-C to stop.\n");

    while (!exiting) {
        err = ring_buffer__poll(rb, 100 /* timeout, ms */);
        if (err == -EINTR) {
            err = 0;
            break;
        }
        if (err < 0) {
            printf("Error polling perf buffer: %d\n", err);
            break;
        }
    }

cleanup:
    ring_buffer__free(rb);
    network_monitor_bpf__destroy(skel);
    curl_global_cleanup();
    return err < 0 ? -err : 0;
}
