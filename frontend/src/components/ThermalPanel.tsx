import { useEffect, useState } from 'react';
import { Fan, Gauge, HardDrive, Save, Thermometer, TriangleAlert, Zap } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useStore } from '../store/useStore';

/* ── Kiểu dữ liệu ─────────────────────────────────────────────────── */

export interface SensorTemp {
  key: string; chip: string; group: string; label: string;
  celsius: number; high: number | null; crit: number | null;
}

export interface SensorDisk {
  device: string; model: string; celsius: number | null;
  power_on_hours: number | null; percentage_used: number | null;
  health: string | null; reallocated: number | null;
}

export interface FanState {
  supported: boolean; writable?: boolean; driver?: string;
  state?: string; raw_enable?: number; rpm: number | null;
  pwm_percent_supported?: boolean; note?: string; error?: string | null;
}

export interface SensorHost {
  host: string; age_seconds: number | null; stale: boolean;
  cpu_hotspot: number | null; temps: SensorTemp[]; disks: SensorDisk[];
  power: { watts?: number | null }; fan: FanState; action?: string;
}

export interface FanPolicy {
  mode: 'auto' | 'max'; on_celsius: number; off_celsius: number; enabled: boolean;
}

export interface SensorsBlock {
  hosts: SensorHost[]; policy: FanPolicy; agent_connected: boolean;
}

/* ── Tiện ích ─────────────────────────────────────────────────────── */

const tempSeverity = (t: SensorTemp): 'ok' | 'warn' | 'crit' => {
  if (t.crit && t.celsius >= t.crit - 5) return 'crit';
  if (t.high && t.celsius >= t.high) return 'warn';
  if (t.crit && t.celsius >= t.crit * 0.85) return 'warn';
  return 'ok';
};

const SEV_TEXT = { ok: 'text-emerald-400', warn: 'text-amber-400', crit: 'text-rose-400' };
const SEV_BAR = { ok: 'bg-emerald-500', warn: 'bg-amber-500', crit: 'bg-rose-500' };

/* Thang nhiệt: 30°C ở đáy, ngưỡng crit (hoặc 90) ở đỉnh */
const tempPercent = (t: SensorTemp) => {
  const top = t.crit ?? 90;
  return Math.max(0, Math.min(((t.celsius - 30) / (top - 30)) * 100, 100));
};

const TempRow = ({ t }: { t: SensorTemp }) => {
  const sev = tempSeverity(t);
  return (
    <div className="flex items-center gap-3 py-[7px]"
         title={t.crit ? `Ngưỡng nguy hiểm ${t.crit}°C` : t.chip}>
      <span className="w-40 shrink-0 truncate text-xs text-soc-muted">
        {t.group}
        <span className="text-gray-600"> · {t.label}</span>
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-800/80 overflow-hidden min-w-[40px]">
        <div className={`h-full rounded-full ${SEV_BAR[sev]}`}
             style={{ width: `${tempPercent(t)}%`, transition: 'width 700ms ease' }} />
      </div>
      <span className={`w-24 shrink-0 text-right text-xs font-medium ${SEV_TEXT[sev]}`}>
        {t.celsius.toFixed(1)}°C
      </span>
    </div>
  );
};

/* ── Bảng điều khiển quạt ─────────────────────────────────────────── */

const FanControl = ({ fan, policy, onSaved }: {
  fan: FanState; policy: FanPolicy; onSaved: () => void;
}) => {
  const userRole = useStore((s) => s.userRole);
  const canControl = ['superadmin', 'Super_Administrator', 'DevOps_Engineer'].includes(userRole);

  const [draft, setDraft] = useState<FanPolicy>(policy);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setDraft(policy), [policy.mode, policy.on_celsius, policy.off_celsius, policy.enabled]);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(id);
  }, [msg]);

  const save = async (patch: Partial<FanPolicy>) => {
    const next = { ...draft, ...patch };
    setBusy(true);
    try {
      const res = await apiFetch('/api/v1/sensors/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: body.detail || 'Không lưu được chính sách' });
      } else {
        setDraft(next);
        setMsg({ ok: true, text: body.note || 'Đã lưu' });
        onSaved();
      }
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Lỗi kết nối' });
    }
    setBusy(false);
  };

  if (!fan.supported) {
    return (
      <div className="rounded-lg border border-gray-800 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-sm text-soc-muted">
          <Fan className="w-4 h-4" /> Bo mạch không hỗ trợ điều khiển quạt
        </div>
        <p className="text-xs text-soc-muted/80 mt-2 leading-relaxed">
          Kernel không tìm thấy kênh PWM nào ghi được, và máy cũng không có IPMI.
          Quạt do BIOS toàn quyền quản lý. Phần giám sát nhiệt độ vẫn hoạt động bình thường.
        </p>
      </div>
    );
  }

  const running = fan.state === 'max';

  return (
    <div className="rounded-lg border border-gray-800 bg-black/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Fan className={`w-4 h-4 ${running ? 'text-amber-400 animate-spin' : 'text-soc-muted'}`}
             style={running ? { animationDuration: '1.2s' } : undefined} />
        <span className="text-sm font-medium text-white">Điều khiển quạt</span>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] border ${
          running ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
          {running ? 'Đang chạy tối đa' : 'BIOS tự điều khiển'}
        </span>
      </div>

      {fan.note && (
        <p className="text-xs text-soc-muted/80 leading-relaxed">{fan.note}</p>
      )}

      {!canControl ? (
        <p className="text-xs text-soc-muted italic">
          Vai trò hiện tại chỉ được xem. Cần quyền quản trị để đổi chính sách quạt.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => save({ mode: 'auto' })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-40 ${
                draft.mode === 'auto'
                  ? 'bg-soc-accent/20 border-soc-accent/40 text-soc-accent'
                  : 'border-gray-700 text-soc-muted hover:bg-gray-800'}`}>
              Tự động
            </button>
            <button
              disabled={busy}
              onClick={() => save({ mode: 'max' })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-40 ${
                draft.mode === 'max'
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                  : 'border-gray-700 text-soc-muted hover:bg-gray-800'}`}>
              Luôn tối đa
            </button>
          </div>

          <div className={draft.mode === 'max' ? 'opacity-40 pointer-events-none' : ''}>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-soc-muted">
                Bật quạt khi CPU đạt
                <div className="flex items-center gap-2 mt-1">
                  <input type="range" min={45} max={95} value={draft.on_celsius}
                         onChange={(e) => setDraft({ ...draft, on_celsius: Number(e.target.value) })}
                         className="flex-1 accent-rose-500" />
                  <span className="w-12 text-right text-rose-400 font-medium">{draft.on_celsius}°C</span>
                </div>
              </label>
              <label className="text-xs text-soc-muted">
                Trả về BIOS khi hạ xuống
                <div className="flex items-center gap-2 mt-1">
                  <input type="range" min={30} max={92} value={draft.off_celsius}
                         onChange={(e) => setDraft({ ...draft, off_celsius: Number(e.target.value) })}
                         className="flex-1 accent-emerald-500" />
                  <span className="w-12 text-right text-emerald-400 font-medium">{draft.off_celsius}°C</span>
                </div>
              </label>
            </div>

            {draft.off_celsius >= draft.on_celsius - 3 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400 mt-2">
                <TriangleAlert className="w-3.5 h-3.5" />
                Ngưỡng tắt phải thấp hơn ngưỡng bật ít nhất 3°C
              </p>
            )}

            <button
              disabled={busy || draft.off_celsius >= draft.on_celsius - 3}
              onClick={() => save({})}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-soc-accent/30 bg-soc-accent/10 text-soc-accent hover:bg-soc-accent/20 disabled:opacity-40">
              <Save className="w-3.5 h-3.5" /> Lưu ngưỡng
            </button>
          </div>

          <p className="text-xs text-soc-muted/70 leading-relaxed border-t border-gray-800 pt-3">
            Cơ chế tự động chỉ được phép làm mát mạnh hơn — nó không bao giờ hạ quạt xuống trong
            lúc nhiệt còn cao. Nếu agent dừng, quạt tự trả về cho BIOS quản lý.
          </p>
        </>
      )}

      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg border ${
          msg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                 : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
};

/* ── Khối chính ───────────────────────────────────────────────────── */

export const ThermalPanel = ({ sensors, onRefresh }: {
  sensors: SensorsBlock | undefined; onRefresh: () => void;
}) => {
  if (!sensors || !sensors.agent_connected) {
    return (
      <div className="bg-soc-card rounded-xl border border-gray-800 shadow-lg">
        <div className="flex items-center px-5 py-4 border-b border-gray-800">
          <Thermometer className="w-4 h-4 text-soc-muted mr-2" />
          <h3 className="text-sm font-semibold text-white">Nhiệt độ & Quạt</h3>
        </div>
        <div className="p-5 text-sm text-soc-muted leading-relaxed">
          Chưa có agent cảm biến nào gửi dữ liệu. Nhiệt độ và quạt nằm ở tầng phần cứng của
          Proxmox host, mà container không đọc được — cần cài{' '}
          <code className="text-soc-accent">agent/aegis_sensor_agent.py</code> trực tiếp trên host.
          Hướng dẫn nằm trong <code className="text-soc-accent">DEPLOYMENT.md</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-soc-card rounded-xl border border-gray-800 shadow-lg">
      <div className="flex items-center px-5 py-4 border-b border-gray-800">
        <Thermometer className="w-4 h-4 text-soc-muted mr-2" />
        <h3 className="text-sm font-semibold text-white">Nhiệt độ & Quạt</h3>
        <span className="ml-auto text-xs text-soc-muted">
          {sensors.hosts.length} host có agent
        </span>
      </div>

      <div className="p-5 space-y-6">
        {sensors.hosts.map((h) => (
          <div key={h.host} className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-soc-muted/80">
              <Gauge className="w-3.5 h-3.5" /> {h.host}
              {h.stale && (
                <span className="px-2 py-0.5 rounded-full text-[10px] border bg-rose-500/10 text-rose-400 border-rose-500/20 normal-case tracking-normal">
                  Ngừng gửi dữ liệu
                </span>
              )}
              {h.power?.watts != null && (
                <span className="ml-auto flex items-center gap-1 text-sky-400 normal-case tracking-normal">
                  <Zap className="w-3.5 h-3.5" /> {h.power.watts} W
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-0">
              <div>
                {h.temps.map((t) => <TempRow key={t.key} t={t} />)}
              </div>
              <FanControl fan={h.fan} policy={sensors.policy} onSaved={onRefresh} />
            </div>

            {h.disks.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-2">
                {h.disks.map((d) => (
                  <div key={d.device}
                       className="rounded-lg border border-gray-800 bg-black/20 p-3 text-xs">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="w-3.5 h-3.5 text-soc-muted" />
                      <span className="font-mono text-slate-200">/dev/{d.device}</span>
                      {d.health && (
                        <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] border ${
                          d.health === 'PASSED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                          {d.health === 'PASSED' ? 'Khỏe' : 'LỖI'}
                        </span>
                      )}
                    </div>
                    <div className="text-soc-muted truncate mb-2" title={d.model}>{d.model}</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-slate-200">{d.celsius != null ? `${d.celsius}°C` : '—'}</div>
                        <div className="text-[10px] text-soc-muted">Nhiệt</div>
                      </div>
                      <div>
                        <div className="text-slate-200">
                          {d.power_on_hours != null ? `${Math.round(d.power_on_hours / 24)}d` : '—'}
                        </div>
                        <div className="text-[10px] text-soc-muted">Tuổi</div>
                      </div>
                      <div>
                        <div className={d.percentage_used != null && d.percentage_used >= 80
                          ? 'text-rose-400' : 'text-slate-200'}>
                          {d.percentage_used != null ? `${d.percentage_used}%` : '—'}
                        </div>
                        <div className="text-[10px] text-soc-muted">Hao mòn</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
