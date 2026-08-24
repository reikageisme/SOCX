import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/api';

export type Severity = 'ok' | 'warn' | 'crit' | 'info';

export interface Gauge {
  key: string;
  label: string;
  icon: string;
  percent: number;
  severity: Severity;
  detail: string;
  sub: string;
}

export interface ResourceItem {
  key: string;
  label: string;
  value: any;
  max: number | null;
  display: string;
  percent: number | null;
  severity: Severity;
  hint: string;
}

export interface ResourceGroup {
  key: string;
  label: string;
  items: ResourceItem[];
}

export interface InfraWarning {
  level: 'crit' | 'warn';
  message: string;
}

export interface InfraStorage {
  storage: string;
  node: string;
  type: string;
  shared: boolean;
  status: string;
  used: number;
  total: number;
  percent: number;
  used_display: string;
  total_display: string;
}

export interface InfraNode {
  node: string;
  status: string;
  cpu: number;
  maxcpu: number;
  cpu_percent: number;
  mem: number;
  maxmem: number;
  mem_percent: number;
  disk: number;
  maxdisk: number;
  disk_percent: number;
  swap_used: number;
  swap_total: number;
  loadavg: string[];
  uptime: number;
  uptime_display: string;
  cpu_model: string;
  pve_version: string;
  kernel: string;
  net_in_bps: number;
  net_out_bps: number;
  guest_count: number;
  guest_running: number;
}

export interface InfraGuest {
  vmid: number;
  name: string;
  status: string;
  type: 'qemu' | 'lxc';
  node: string;
  cpu_percent: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  mem_percent: number;
  disk: number;
  maxdisk: number;
  disk_percent: number;
  uptime_display: string;
  disk_read_bps: number;
  disk_write_bps: number;
  net_in_bps: number;
  net_out_bps: number;
  ha_state: string;
  tags: string[];
}

export interface InfraSoc {
  open_incidents: number;
  critical_incidents: number;
  pending_actions: number;
  events_24h: number | null;
  ioc_cached: number;
  sensor_active: boolean;
  last_event: string | null;
}

export interface SensorsBlock {
  hosts: any[];
  policy: { mode: 'auto' | 'max'; on_celsius: number; off_celsius: number; enabled: boolean };
  agent_connected: boolean;
}

export interface InfraOverview {
  type: string;
  generated_at: string;
  connected: boolean;
  mock: boolean;
  build_ms: number;
  gauges: Gauge[];
  groups: ResourceGroup[];
  warnings: InfraWarning[];
  storages: InfraStorage[];
  soc: InfraSoc;
  sensors?: SensorsBlock;
  nodes: InfraNode[];
  vms: InfraGuest[];
}

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

const MAX_BACKOFF = 30000;

/**
 * Nguon du lieu ha tang: bootstrap bang REST roi giu live qua WebSocket.
 * Tu dong ket noi lai voi backoff luy thua khi duong truyen dut.
 */
export const useInfrastructure = () => {
  const token = useStore((s) => s.token);
  const [data, setData] = useState<InfraOverview | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closedRef = useRef(false);

  const applyPayload = useCallback((payload: InfraOverview) => {
    if (!payload || !payload.gauges) return;
    setData(payload);
    setLastUpdate(new Date());
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/proxmox/overview');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status === 'success') applyPayload(json.data);
    } catch (e: any) {
      setError(e?.message || 'Không tải được dữ liệu hạ tầng');
    }
  }, [applyPayload]);

  useEffect(() => {
    if (!token) return;
    closedRef.current = false;

    // Bootstrap REST — UI co du lieu ngay ca khi WebSocket bi chan
    refresh();

    const connect = () => {
      if (closedRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/api/v1/ws/infrastructure?token=${encodeURIComponent(token)}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setStatus('live');
        if (pingRef.current) clearInterval(pingRef.current);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === 'pong') return;
          applyPayload(payload);
        } catch (e) {
          console.error('[infra] Lỗi phân tích payload WebSocket', e);
        }
      };

      ws.onerror = () => setStatus((s) => (s === 'live' ? 'reconnecting' : s));

      ws.onclose = (ev) => {
        if (pingRef.current) clearInterval(pingRef.current);
        if (closedRef.current) return;
        if (ev.code === 4001) {
          setStatus('offline');
          setError('Phiên đăng nhập không hợp lệ cho luồng hạ tầng.');
          return;
        }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      setStatus('reconnecting');
      const delay = Math.min(1000 * 2 ** retryRef.current, MAX_BACKOFF);
      retryRef.current += 1;
      // Trong luc cho, van poll REST de so lieu khong dung yen
      refresh();
      timerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [token, refresh, applyPayload]);

  return { data, status, lastUpdate, error, refresh };
};
