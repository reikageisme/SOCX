import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Boxes, Camera, ChevronDown, ChevronRight, Cpu, Database, ExternalLink,
  HardDrive, Monitor, Network, Play, Power, RefreshCw, RotateCw, Server,
  ShieldBan, TriangleAlert, Wifi,
} from 'lucide-react';
import { useInfrastructure } from '../hooks/useInfrastructure';
import type {
  Gauge as GaugeData, InfraGuest, InfraNode, ResourceItem, Severity, StreamStatus,
} from '../hooks/useInfrastructure';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/api';

/* ── Bảng màu theo mức độ ─────────────────────────────────────────── */

const SEV: Record<Severity, { stroke: string; text: string; bar: string; chip: string }> = {
  ok: { stroke: '#10B981', text: 'text-emerald-400', bar: 'bg-emerald-500', chip: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  warn: { stroke: '#F59E0B', text: 'text-amber-400', bar: 'bg-amber-500', chip: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  crit: { stroke: '#EF4444', text: 'text-rose-400', bar: 'bg-rose-500', chip: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  info: { stroke: '#3B82F6', text: 'text-sky-400', bar: 'bg-sky-500', chip: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
};

const GAUGE_ICONS: Record<string, typeof Cpu> = {
  disk: HardDrive,
  cpu: Cpu,
  ram: Database,
  bandwidth: Wifi,
};

const GROUP_ICONS: Record<string, typeof Cpu> = {
  core: Boxes,
  io: Activity,
  soc: ShieldBan,
  ops: Server,
};

const fmtBps = (bps: number) => {
  const bits = (bps || 0) * 8;
  if (bits < 1000) return `${bits.toFixed(0)} bps`;
  if (bits < 1e6) return `${(bits / 1e3).toFixed(1)} Kbps`;
  if (bits < 1e9) return `${(bits / 1e6).toFixed(1)} Mbps`;
  return `${(bits / 1e9).toFixed(2)} Gbps`;
};

const fmtBytes = (n: number) => {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i < 2 ? 0 : 1)} ${units[i]}`;
};

/* ── Vòng tròn tiến độ ────────────────────────────────────────────── */

const Donut = ({ percent, severity, size = 108 }: { percent: number; severity: Severity; size?: number }) => {
  const stroke = 9;
  const r = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(percent ?? 0, 100));
  const offset = circumference - (circumference * pct) / 100;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1F2937" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={SEV[severity].stroke} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1), stroke 300ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xl font-bold ${SEV[severity].text}`}>{Math.round(pct)}%</span>
      </div>
    </div>
  );
};

const GaugeCard = ({ gauge }: { gauge: GaugeData }) => {
  const Icon = GAUGE_ICONS[gauge.key] || Activity;
  return (
    <div className="bg-soc-card rounded-xl border border-gray-800 p-5 shadow-lg">
      <div className="flex items-center gap-2 text-soc-muted text-sm font-medium mb-3">
        <Icon className="w-4 h-4" />
        {gauge.label}
        <span className={`ml-auto w-2 h-2 rounded-full ${SEV[gauge.severity].bar}`} />
      </div>
      <div className="flex flex-col items-center gap-3">
        <Donut percent={gauge.percent} severity={gauge.severity} />
        <div className="text-center">
          <div className="text-sm text-slate-200 font-medium">{gauge.detail}</div>
          <div className="text-xs text-soc-muted mt-0.5">{gauge.sub}</div>
        </div>
      </div>
    </div>
  );
};

/* ── Thanh tài nguyên ─────────────────────────────────────────────── */

const ResourceBar = ({ item }: { item: ResourceItem }) => {
  // Không có mức trần (ví dụ "Task đang chạy") thì vẽ vạch mảnh tượng trưng
  const width = item.percent !== null && item.percent !== undefined
    ? Math.max(item.percent, item.percent > 0 ? 2 : 0)
    : (item.severity === 'crit' ? 100 : item.severity === 'warn' ? 40 : 4);

  return (
    <div className="flex items-center gap-3 py-[7px]" title={item.hint || item.label}>
      <span className="w-32 shrink-0 truncate text-xs text-soc-muted">{item.label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-800/80 overflow-hidden min-w-[40px]">
        <div
          className={`h-full rounded-full ${SEV[item.severity].bar}`}
          style={{ width: `${width}%`, transition: 'width 700ms cubic-bezier(0.4,0,0.2,1)' }}
        />
      </div>
      <span className="w-36 shrink-0 text-right text-xs text-slate-300 truncate">{item.display}</span>
    </div>
  );
};

/* ── Chỉ báo luồng dữ liệu ────────────────────────────────────────── */

const LiveBadge = ({ status, lastUpdate }: { status: StreamStatus; lastUpdate: Date | null }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const map: Record<StreamStatus, { label: string; cls: string; dot: string }> = {
    live: { label: 'Trực tiếp', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
    connecting: { label: 'Đang kết nối', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20', dot: 'bg-sky-500' },
    reconnecting: { label: 'Đang kết nối lại', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
    offline: { label: 'Mất kết nối', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dot: 'bg-rose-500' },
  };
  const cfg = map[status];
  const ago = lastUpdate ? Math.max(0, Math.round((Date.now() - lastUpdate.getTime()) / 1000)) : null;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${cfg.cls}`}>
      <span className={`relative flex w-2 h-2`}>
        {status === 'live' && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-60`} />}
        <span className={`relative inline-flex rounded-full w-2 h-2 ${cfg.dot}`} />
      </span>
      {cfg.label}
      {ago !== null && <span className="text-soc-muted font-normal">· {ago}s trước</span>}
    </div>
  );
};

/* ── Hàng node + guest ────────────────────────────────────────────── */

const StatusChip = ({ status }: { status: string }) => {
  const ok = status === 'running' || status === 'online';
  return (
    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${
      ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
         : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      {status === 'running' ? 'đang chạy' : status === 'online' ? 'trực tuyến'
        : status === 'stopped' ? 'đã dừng' : status}
    </span>
  );
};

const MiniMeter = ({ percent, severity }: { percent: number; severity: Severity }) => (
  <div className="w-16 h-1.5 rounded-full bg-gray-800 overflow-hidden inline-block align-middle">
    <div className={`h-full ${SEV[severity].bar}`}
         style={{ width: `${Math.min(percent || 0, 100)}%`, transition: 'width 600ms ease' }} />
  </div>
);

const sevOf = (p: number): Severity => (p >= 90 ? 'crit' : p >= 80 ? 'warn' : 'ok');

const NodeBlock = ({
  node, guests, canControl, onAction, onConsole, busy,
}: {
  node: InfraNode;
  guests: InfraGuest[];
  canControl: boolean;
  onAction: (g: InfraGuest, action: string) => void;
  onConsole: (g: InfraGuest) => void;
  busy: string | null;
}) => {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden bg-black/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-soc-card hover:bg-white/[0.03] transition-colors text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-soc-muted" /> : <ChevronRight className="w-4 h-4 text-soc-muted" />}
        <Server className="w-4 h-4 text-soc-accent" />
        <span className="font-semibold text-white">{node.node}</span>
        <StatusChip status={node.status} />
        <span className="text-xs text-soc-muted hidden md:inline">{node.cpu_model}</span>

        <div className="ml-auto flex items-center gap-5 text-xs text-soc-muted">
          <span className="flex items-center gap-1.5" title="CPU">
            <Cpu className="w-3.5 h-3.5" />
            <MiniMeter percent={node.cpu_percent} severity={sevOf(node.cpu_percent)} />
            {node.cpu_percent.toFixed(1)}%
          </span>
          <span className="flex items-center gap-1.5" title="RAM">
            <Database className="w-3.5 h-3.5" />
            <MiniMeter percent={node.mem_percent} severity={sevOf(node.mem_percent)} />
            {node.mem_percent}%
          </span>
          <span className="hidden lg:flex items-center gap-1.5" title="Đĩa hệ thống">
            <HardDrive className="w-3.5 h-3.5" />
            <MiniMeter percent={node.disk_percent} severity={sevOf(node.disk_percent)} />
            {node.disk_percent}%
          </span>
          <span className="hidden xl:flex items-center gap-1.5" title="Băng thông">
            <Network className="w-3.5 h-3.5" />
            ↓{fmtBps(node.net_in_bps)} ↑{fmtBps(node.net_out_bps)}
          </span>
          <span className="hidden xl:inline">{node.uptime_display}</span>
          <span className="text-slate-300">{node.guest_running}/{node.guest_count} máy ảo</span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[860px]">
            <thead>
              <tr className="text-soc-muted text-xs border-b border-gray-800/70">
                <th className="py-2 pl-10 font-medium">Máy ảo / Container</th>
                <th className="py-2 font-medium">Trạng thái</th>
                <th className="py-2 font-medium">CPU</th>
                <th className="py-2 font-medium">RAM</th>
                <th className="py-2 font-medium">Đĩa</th>
                <th className="py-2 font-medium">Mạng</th>
                <th className="py-2 font-medium">Uptime</th>
                <th className="py-2 pr-4 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {guests.length === 0 && (
                <tr><td colSpan={8} className="py-4 pl-10 text-xs italic text-soc-muted">Không có VM/LXC nào trên node này.</td></tr>
              )}
              {guests.map((g) => (
                <tr key={`${g.node}-${g.vmid}`} className="group border-b border-gray-800/30 hover:bg-white/[0.02]">
                  <td className="py-2 pl-10 font-mono text-slate-200 whitespace-nowrap">
                    <span className="text-gray-600 mr-1">└─</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded mr-1.5 border ${
                      g.type === 'lxc' ? 'border-violet-500/30 text-violet-300 bg-violet-500/10'
                                       : 'border-sky-500/30 text-sky-300 bg-sky-500/10'}`}>
                      {g.type === 'lxc' ? 'CT' : 'VM'}
                    </span>
                    {g.name} <span className="text-xs text-gray-500">({g.vmid})</span>
                  </td>
                  <td className="py-2"><StatusChip status={g.status} /></td>
                  <td className="py-2 text-soc-muted whitespace-nowrap">
                    <MiniMeter percent={g.cpu_percent} severity={sevOf(g.cpu_percent)} /> {g.cpu_percent.toFixed(1)}%
                  </td>
                  <td className="py-2 text-soc-muted whitespace-nowrap">
                    <MiniMeter percent={g.mem_percent} severity={sevOf(g.mem_percent)} /> {fmtBytes(g.mem)}
                  </td>
                  <td className="py-2 text-soc-muted whitespace-nowrap text-xs">
                    R {fmtBytes(g.disk_read_bps)}/s · W {fmtBytes(g.disk_write_bps)}/s
                  </td>
                  <td className="py-2 text-soc-muted whitespace-nowrap text-xs">
                    ↓{fmtBps(g.net_in_bps)} ↑{fmtBps(g.net_out_bps)}
                  </td>
                  <td className="py-2 text-soc-muted text-xs whitespace-nowrap">{g.uptime_display}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-1.5 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                      {canControl && g.status !== 'running' && (
                        <button onClick={() => onAction(g, 'start')} disabled={!!busy}
                          className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-30" title="Khởi động">
                          <Play size={14} className={busy === `${g.vmid}-start` ? 'animate-pulse' : ''} />
                        </button>
                      )}
                      {canControl && g.status === 'running' && (
                        <>
                          <button onClick={() => onAction(g, 'shutdown')} disabled={!!busy}
                            className="p-1.5 rounded hover:bg-amber-500/20 text-amber-400 disabled:opacity-30" title="Tắt máy (shutdown)">
                            <Power size={14} className={busy === `${g.vmid}-shutdown` ? 'animate-pulse' : ''} />
                          </button>
                          <button onClick={() => onAction(g, 'reboot')} disabled={!!busy}
                            className="p-1.5 rounded hover:bg-sky-500/20 text-sky-400 disabled:opacity-30" title="Khởi động lại">
                            <RotateCw size={14} className={busy === `${g.vmid}-reboot` ? 'animate-pulse' : ''} />
                          </button>
                          <button onClick={() => onAction(g, 'isolate')} disabled={!!busy}
                            className="p-1.5 rounded hover:bg-rose-500/20 text-rose-400 disabled:opacity-30" title="Cách ly (tạo yêu cầu duyệt)">
                            <ShieldBan size={14} className={busy === `${g.vmid}-isolate` ? 'animate-pulse' : ''} />
                          </button>
                        </>
                      )}
                      {canControl && (
                        <button onClick={() => onAction(g, 'snapshot')} disabled={!!busy}
                          className="p-1.5 rounded hover:bg-indigo-500/20 text-indigo-400 disabled:opacity-30" title="Snapshot (tạo yêu cầu duyệt)">
                          <Camera size={14} className={busy === `${g.vmid}-snapshot` ? 'animate-pulse' : ''} />
                        </button>
                      )}
                      <button onClick={() => onConsole(g)}
                        className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400" title="Mở console">
                        <Monitor size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ── Trang chính ──────────────────────────────────────────────────── */

const DESTRUCTIVE = new Set(['stop', 'shutdown', 'reboot', 'isolate']);

const ACTION_LABEL: Record<string, string> = {
  start: 'Khởi động', shutdown: 'Tắt máy', stop: 'Dừng cưỡng bức',
  reboot: 'Khởi động lại', isolate: 'Cách ly', snapshot: 'Tạo snapshot',
};

export const Infrastructure = () => {
  const { data, status, lastUpdate, error, refresh } = useInfrastructure();
  const userRole = useStore((s) => s.userRole);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<{ guest: InfraGuest; action: string } | null>(null);

  const canControl = ['superadmin', 'Super_Administrator', 'DevOps_Engineer'].includes(userRole);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const visibleGroups = useMemo(() => {
    if (!data) return [];
    return expanded ? data.groups : data.groups.slice(0, 2);
  }, [data, expanded]);

  const execute = async (guest: InfraGuest, action: string) => {
    setBusy(`${guest.vmid}-${action}`);
    try {
      const res = await apiFetch(`/api/v1/proxmox/nodes/${guest.node}/vms/${guest.vmid}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: 'err', text: body.detail || `Không thực hiện được: ${ACTION_LABEL[action] || action}` });
      } else {
        setToast({
          kind: 'ok',
          text: body.message || `Đã gửi lệnh ${ACTION_LABEL[action] || action} tới ${guest.name} (${guest.vmid}).`,
        });
        setTimeout(refresh, 1500);
      }
    } catch (e: any) {
      setToast({ kind: 'err', text: e?.message || 'Lỗi kết nối tới backend.' });
    }
    setBusy(null);
  };

  const handleAction = (guest: InfraGuest, action: string) => {
    if (DESTRUCTIVE.has(action)) setConfirming({ guest, action });
    else execute(guest, action);
  };

  const handleConsole = async (guest: InfraGuest) => {
    try {
      const res = await apiFetch('/api/v1/proxmox/config');
      const body = await res.json();
      if (body.status === 'success' && body.host) {
        const type = guest.type === 'qemu' ? 'kvm' : 'lxc';
        window.open(
          `https://${body.host}:8006/?console=${type}&novnc=1&vmid=${guest.vmid}&vmname=${guest.name}&node=${guest.node}`,
          '_blank', 'noopener,noreferrer',
        );
      } else {
        setToast({ kind: 'err', text: 'Backend chưa cấu hình PROXMOX_HOST.' });
      }
    } catch {
      setToast({ kind: 'err', text: 'Không lấy được cấu hình Proxmox.' });
    }
  };

  const openProxmoxUI = async () => {
    try {
      const res = await apiFetch('/api/v1/proxmox/config');
      const body = await res.json();
      if (body.host) window.open(`https://${body.host}:8006/`, '_blank', 'noopener,noreferrer');
    } catch {
      setToast({ kind: 'err', text: 'Không lấy được cấu hình Proxmox.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Server className="w-6 h-6 text-soc-accent" />
            Hạ tầng Proxmox
          </h1>
          <p className="text-sm text-soc-muted mt-1">
            Giám sát tài nguyên và quản trị host theo thời gian thực — dùng chung cho SOC và vận hành.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data?.mock && (
            <span className="px-2.5 py-1 rounded-lg text-xs border bg-violet-500/10 text-violet-300 border-violet-500/20">
              Dữ liệu mô phỏng
            </span>
          )}
          <LiveBadge status={status} lastUpdate={lastUpdate} />
          <button onClick={refresh}
            className="p-2 rounded-lg border border-gray-800 text-soc-muted hover:text-white hover:bg-gray-800 transition-colors"
            title="Làm mới ngay">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={openProxmoxUI}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-soc-accent/30 bg-soc-accent/10 text-soc-accent hover:bg-soc-accent/20 transition-colors">
            <ExternalLink className="w-4 h-4" /> Mở Proxmox UI
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 text-sm">
          <TriangleAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {!data ? (
        <div className="bg-soc-card rounded-xl border border-gray-800 p-16 text-center text-soc-muted">
          Đang kết nối luồng dữ liệu hạ tầng…
        </div>
      ) : (
        <>
          {/* 4 vòng tròn tài nguyên chính */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.gauges.map((g) => <GaugeCard key={g.key} gauge={g} />)}
          </div>

          {/* Tài nguyên khác */}
          <div className="bg-soc-card rounded-xl border border-gray-800 shadow-lg">
            <div className="flex items-center px-5 py-4 border-b border-gray-800">
              <Boxes className="w-4 h-4 text-soc-muted mr-2" />
              <h3 className="text-sm font-semibold text-white">Tài nguyên khác</h3>
              <button onClick={() => setExpanded((v) => !v)}
                className="ml-auto text-sm text-soc-accent hover:text-sky-300 transition-colors flex items-center gap-1">
                {expanded ? 'Thu gọn' : 'Xem chi tiết'}
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>

            <div className="p-5 space-y-5">
              {visibleGroups.map((group) => {
                const GroupIcon = GROUP_ICONS[group.key] || Activity;
                return (
                  <div key={group.key}>
                    <div className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-wider text-soc-muted/80">
                      <GroupIcon className="w-3.5 h-3.5" /> {group.label}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
                      {group.items.map((item) => <ResourceBar key={item.key} item={item} />)}
                    </div>
                  </div>
                );
              })}
            </div>

            {data.warnings.length > 0 && (
              <div className="px-5 pb-5 space-y-2">
                {data.warnings.slice(0, expanded ? 20 : 3).map((w, i) => (
                  <div key={i}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm ${
                      w.level === 'crit'
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-300'}`}>
                    <TriangleAlert className="w-4 h-4 shrink-0" />
                    {w.message}
                  </div>
                ))}
                {!expanded && data.warnings.length > 3 && (
                  <button onClick={() => setExpanded(true)} className="text-xs text-soc-muted hover:text-white">
                    + {data.warnings.length - 3} cảnh báo khác
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Storage pools */}
          {data.storages.length > 0 && (
            <div className="bg-soc-card rounded-xl border border-gray-800 shadow-lg">
              <div className="flex items-center px-5 py-4 border-b border-gray-800">
                <HardDrive className="w-4 h-4 text-soc-muted mr-2" />
                <h3 className="text-sm font-semibold text-white">Storage pool</h3>
                <span className="ml-auto text-xs text-soc-muted">{data.storages.length} pool</span>
              </div>
              <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-x-10">
                {data.storages.map((s) => (
                  <div key={`${s.node}-${s.storage}`} className="flex items-center gap-3 py-[7px]"
                       title={`${s.type}${s.shared ? ' · shared' : ''} · ${s.status}`}>
                    <span className="w-32 shrink-0 truncate text-xs text-soc-muted">
                      {s.storage}
                      <span className="text-gray-600"> · {s.node}</span>
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-800/80 overflow-hidden min-w-[40px]">
                      <div className={`h-full rounded-full ${SEV[sevOf(s.percent)].bar}`}
                           style={{ width: `${s.percent}%`, transition: 'width 700ms ease' }} />
                    </div>
                    <span className="w-36 shrink-0 text-right text-xs text-slate-300 truncate">
                      {s.used_display} / {s.total_display}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Node & máy ảo */}
          <div className="bg-soc-card rounded-xl border border-gray-800 shadow-lg">
            <div className="flex items-center px-5 py-4 border-b border-gray-800">
              <Server className="w-4 h-4 text-soc-muted mr-2" />
              <h3 className="text-sm font-semibold text-white">Node, máy ảo & container</h3>
              {!canControl && (
                <span className="ml-3 text-xs text-soc-muted italic">Chế độ chỉ xem — vai trò hiện tại không có quyền điều khiển</span>
              )}
              <span className="ml-auto text-xs text-soc-muted">
                {data.nodes.length} node · {data.vms.length} guest
              </span>
            </div>
            <div className="p-5 space-y-3">
              {data.nodes.length === 0 && (
                <div className="py-8 text-center text-soc-muted italic">
                  Không tìm thấy node nào. Kiểm tra API token Proxmox trong cấu hình backend.
                </div>
              )}
              {data.nodes.map((node) => (
                <NodeBlock
                  key={node.node}
                  node={node}
                  guests={data.vms.filter((v) => v.node === node.node)}
                  canControl={canControl}
                  onAction={handleAction}
                  onConsole={handleConsole}
                  busy={busy}
                />
              ))}
            </div>
          </div>

          <p className="text-xs text-soc-muted text-center">
            Cập nhật lúc {new Date(data.generated_at).toLocaleString('vi-VN')} · tổng hợp trong {data.build_ms} ms
          </p>
        </>
      )}

      {/* Hộp xác nhận */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-soc-card border border-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h4 className="text-white font-semibold flex items-center gap-2">
              <TriangleAlert className="w-5 h-5 text-amber-400" />
              Xác nhận: {ACTION_LABEL[confirming.action] || confirming.action}
            </h4>
            <p className="text-sm text-soc-muted mt-3">
              Bạn sắp thực hiện <span className="text-white font-medium">{ACTION_LABEL[confirming.action]}</span> trên{' '}
              <span className="text-white font-mono">{confirming.guest.name} ({confirming.guest.vmid})</span> tại node{' '}
              <span className="text-white">{confirming.guest.node}</span>.
              {confirming.action === 'isolate' &&
                ' Hành động này sẽ tạo một yêu cầu chờ duyệt trong module Incidents thay vì thực thi ngay.'}
            </p>
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setConfirming(null)}
                className="px-4 py-2 rounded-lg text-sm border border-gray-700 text-soc-muted hover:text-white hover:bg-gray-800">
                Hủy
              </button>
              <button
                onClick={() => { const c = confirming; setConfirming(null); execute(c.guest, c.action); }}
                className="px-4 py-2 rounded-lg text-sm bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30">
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thông báo */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border shadow-xl text-sm max-w-sm ${
          toast.kind === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
};

export default Infrastructure;
