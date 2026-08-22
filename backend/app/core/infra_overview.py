"""
Tong hop toan bo so lieu ha tang Proxmox cho trang Infrastructure.

Module nay duoc dung boi ca REST (/api/v1/proxmox/overview) va job
broadcast WebSocket (ws/infrastructure) nen chi co MOT nguon su that.
"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.config import settings
from app.services.proxmox import proxmox_service

logger = logging.getLogger("infra_overview")

# Bo dem tinh toc do: {key: (timestamp, {counter: value})}
_rate_state: Dict[str, Any] = {}
_rate_lock = threading.Lock()

# Cache RRD theo node (RRD chi cap nhat moi ~60s nen khong can goi lien tuc)
_rrd_cache: Dict[str, Any] = {}
_rrd_lock = threading.Lock()
_RRD_TTL = 20.0


# ── Tien ich ──────────────────────────────────────────────────────────

def _pct(used: float, total: float) -> float:
    if not total or total <= 0:
        return 0.0
    return round(min(used / total * 100.0, 100.0), 1)


def fmt_bytes(n: Optional[float]) -> str:
    if n is None:
        return "N/A"
    n = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if abs(n) < 1024.0 or unit == "PB":
            return f"{n:.2f} {unit}" if unit not in ("B", "KB") else f"{n:.0f} {unit}"
        n /= 1024.0
    return f"{n:.2f} PB"


def fmt_bps(bytes_per_sec: Optional[float]) -> str:
    if bytes_per_sec is None:
        return "N/A"
    bits = float(bytes_per_sec) * 8
    for unit in ("bps", "Kbps", "Mbps", "Gbps"):
        if abs(bits) < 1000.0 or unit == "Gbps":
            return f"{bits:.1f} {unit}"
        bits /= 1000.0
    return f"{bits:.1f} Gbps"


def fmt_uptime(seconds: Optional[float]) -> str:
    if not seconds:
        return "N/A"
    seconds = int(seconds)
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes = rem // 60
    if days:
        return f"{days} ngày {hours} giờ"
    if hours:
        return f"{hours} giờ {minutes} phút"
    return f"{minutes} phút"


def _severity(percent: Optional[float]) -> str:
    if percent is None:
        return "info"
    if percent >= settings.INFRA_CRIT_PERCENT:
        return "crit"
    if percent >= settings.INFRA_WARN_PERCENT:
        return "warn"
    return "ok"


def _bar(key: str, label: str, value: Any, maximum: Any = None,
         display: Optional[str] = None, percent: Optional[float] = None,
         severity: Optional[str] = None, hint: str = "") -> Dict[str, Any]:
    if percent is None and isinstance(value, (int, float)) and isinstance(maximum, (int, float)):
        percent = _pct(value, maximum)
    return {
        "key": key,
        "label": label,
        "value": value,
        "max": maximum,
        "display": display if display is not None else (
            f"{value} / {maximum}" if maximum is not None else str(value)
        ),
        "percent": percent,
        "severity": severity or _severity(percent),
        "hint": hint,
    }


def _rates(key: str, counters: Dict[str, float]) -> Dict[str, float]:
    """Tinh delta/giay giua hai lan poll cho cac counter tich luy."""
    now = time.time()
    out = {k: 0.0 for k in counters}
    with _rate_lock:
        prev = _rate_state.get(key)
        # Hai lan goi qua gan nhau (REST xen giua chu ky poll) -> tra lai ket qua cu
        if prev and now - prev[0] < 2.0:
            return dict(prev[2])
        _rate_state[key] = (now, dict(counters), out)

    if not prev:
        return out
    prev_ts, prev_counters, _prev_rates = prev
    dt = now - prev_ts
    if dt > 600:  # gian doan qua lau, so lieu khong con y nghia
        return out
    for k, v in counters.items():
        pv = prev_counters.get(k)
        if pv is None or v is None:
            continue
        delta = v - pv
        if delta < 0:  # counter bi reset (guest khoi dong lai)
            continue
        out[k] = delta / dt
    with _rate_lock:
        _rate_state[key] = (now, dict(counters), dict(out))
    return out


def _node_rrd(node_name: str) -> List[Dict[str, Any]]:
    now = time.time()
    with _rrd_lock:
        item = _rrd_cache.get(node_name)
    if item and now - item[0] < _RRD_TTL:
        return item[1]
    data = proxmox_service.get_rrddata(node_name, "hour") or []
    with _rrd_lock:
        _rrd_cache[node_name] = (now, data)
    return data


# ── Xay dung payload ──────────────────────────────────────────────────

def build_overview() -> Dict[str, Any]:
    started = time.time()
    resources = proxmox_service.get_cluster_resources()

    nodes_raw: List[Dict[str, Any]] = []
    guests: List[Dict[str, Any]] = []
    storages_raw: List[Dict[str, Any]] = []

    if resources:
        for r in resources:
            rtype = r.get("type")
            if rtype == "node":
                nodes_raw.append(r)
            elif rtype in ("qemu", "lxc"):
                guests.append(r)
            elif rtype == "storage":
                storages_raw.append(r)

    # Fallback neu /cluster/resources khong kha dung (token thieu quyen)
    if not nodes_raw:
        nodes_raw = proxmox_service.get_nodes() or []
        for n in nodes_raw:
            nname = n.get("node")
            for vm in (proxmox_service.get_vms(nname) or []):
                vm = dict(vm); vm["type"] = "qemu"; vm["node"] = nname
                guests.append(vm)
            for ct in (proxmox_service.get_lxc(nname) or []):
                ct = dict(ct); ct["type"] = "lxc"; ct["node"] = nname
                guests.append(ct)

    connected = bool(nodes_raw)

    # ── Chi tiet tung node ────────────────────────────────────────────
    nodes: List[Dict[str, Any]] = []
    net_in_bps = net_out_bps = 0.0
    load1_total = 0.0
    swap_used = swap_total = 0
    root_used = root_total = 0
    cpu_weighted = cpu_cores = 0.0
    mem_used = mem_total = 0
    updates_pending = 0
    repl_failed = 0
    running_tasks = 0
    cert_soon = 0
    services_down: List[str] = []
    last_backup_ts: Optional[int] = None
    node_net_max_bps = 0.0

    for n in nodes_raw:
        nname = n.get("node")
        online = n.get("status") == "online"
        status = proxmox_service.get_node_status(nname) if online else {}

        mem = status.get("memory") or {}
        swp = status.get("swap") or {}
        root = status.get("rootfs") or {}
        cpuinfo = status.get("cpuinfo") or {}
        loadavg = status.get("loadavg") or []

        n_maxcpu = n.get("maxcpu") or cpuinfo.get("cpus") or 1
        n_cpu = n.get("cpu", status.get("cpu", 0)) or 0
        n_mem = mem.get("used", n.get("mem", 0)) or 0
        n_maxmem = mem.get("total", n.get("maxmem", 0)) or 0

        # Bang thong lay tu RRD (Proxmox tra ve byte/giay san)
        n_in = n_out = 0.0
        if online:
            rrd = _node_rrd(nname)
            for sample in reversed(rrd[-5:] if rrd else []):
                if sample.get("netin") is not None or sample.get("netout") is not None:
                    n_in = float(sample.get("netin") or 0)
                    n_out = float(sample.get("netout") or 0)
                    break
        net_in_bps += n_in
        net_out_bps += n_out
        node_net_max_bps += settings.NET_LINK_MBPS * 1_000_000 / 8

        if online:
            cpu_weighted += float(n_cpu) * float(n_maxcpu)
            cpu_cores += float(n_maxcpu)
            mem_used += int(n_mem)
            mem_total += int(n_maxmem)
            swap_used += int(swp.get("used", 0) or 0)
            swap_total += int(swp.get("total", 0) or 0)
            root_used += int(root.get("used", n.get("disk", 0)) or 0)
            root_total += int(root.get("total", n.get("maxdisk", 0)) or 0)
            try:
                load1_total += float(loadavg[0]) if loadavg else 0.0
            except (TypeError, ValueError):
                pass

            # Vận hành host (cac API cham, da cache trong service)
            updates_pending += len(proxmox_service.get_apt_updates(nname) or [])

            for job in (proxmox_service.get_replication(nname) or []):
                if job.get("error") or job.get("fail_count"):
                    repl_failed += 1

            for t in (proxmox_service.get_tasks(nname, 50) or []):
                if t.get("status") in (None, "running") and not t.get("endtime"):
                    running_tasks += 1
                if t.get("type") == "vzdump" and t.get("endtime"):
                    if last_backup_ts is None or t["endtime"] > last_backup_ts:
                        last_backup_ts = t["endtime"]

            soon = time.time() + 30 * 86400
            for c in (proxmox_service.get_certificates(nname) or []):
                na = c.get("notafter")
                if na and float(na) < soon:
                    cert_soon += 1

            for s in (proxmox_service.get_services(nname) or []):
                if s.get("name") in ("pveproxy", "pvedaemon", "pve-firewall", "pve-cluster", "sshd") \
                        and s.get("state") not in ("running", "active"):
                    services_down.append(f"{nname}/{s.get('name')}")

        node_guests = [g for g in guests if g.get("node") == nname]
        nodes.append({
            "node": nname,
            "status": n.get("status", "unknown"),
            "cpu": n_cpu,
            "maxcpu": n_maxcpu,
            "cpu_percent": round(float(n_cpu) * 100, 1),
            "mem": n_mem,
            "maxmem": n_maxmem,
            "mem_percent": _pct(n_mem, n_maxmem),
            "disk": root.get("used", n.get("disk", 0)),
            "maxdisk": root.get("total", n.get("maxdisk", 0)),
            "disk_percent": _pct(root.get("used", n.get("disk", 0)) or 0,
                                 root.get("total", n.get("maxdisk", 0)) or 0),
            "swap_used": swp.get("used", 0),
            "swap_total": swp.get("total", 0),
            "loadavg": loadavg,
            "uptime": n.get("uptime", status.get("uptime", 0)),
            "uptime_display": fmt_uptime(n.get("uptime", status.get("uptime", 0))),
            "cpu_model": cpuinfo.get("model", ""),
            "pve_version": status.get("pveversion", ""),
            "kernel": status.get("kversion", ""),
            "net_in_bps": n_in,
            "net_out_bps": n_out,
            "guest_count": len(node_guests),
            "guest_running": len([g for g in node_guests if g.get("status") == "running"]),
        })

    # ── Guests + toc do I/O ───────────────────────────────────────────
    vms: List[Dict[str, Any]] = []
    disk_read_bps = disk_write_bps = 0.0
    guest_net_in = guest_net_out = 0.0

    for g in guests:
        gid = g.get("vmid")
        rates = _rates(f"guest:{gid}", {
            "diskread": float(g.get("diskread") or 0),
            "diskwrite": float(g.get("diskwrite") or 0),
            "netin": float(g.get("netin") or 0),
            "netout": float(g.get("netout") or 0),
        }) if g.get("status") == "running" else {
            "diskread": 0.0, "diskwrite": 0.0, "netin": 0.0, "netout": 0.0}

        disk_read_bps += rates["diskread"]
        disk_write_bps += rates["diskwrite"]
        guest_net_in += rates["netin"]
        guest_net_out += rates["netout"]

        vms.append({
            "vmid": gid,
            "name": g.get("name"),
            "status": g.get("status"),
            "type": g.get("type", "qemu"),
            "node": g.get("node"),
            "cpu": g.get("cpu", 0) or 0,
            "maxcpu": g.get("maxcpu", 1) or 1,
            "cpu_percent": round(float(g.get("cpu") or 0) * 100, 1),
            "mem": g.get("mem", 0) or 0,
            "maxmem": g.get("maxmem", 1) or 1,
            "mem_percent": _pct(g.get("mem", 0) or 0, g.get("maxmem", 1) or 1),
            "disk": g.get("disk", 0) or 0,
            "maxdisk": g.get("maxdisk", 0) or 0,
            "disk_percent": _pct(g.get("disk", 0) or 0, g.get("maxdisk", 0) or 0),
            "uptime": g.get("uptime", 0) or 0,
            "uptime_display": fmt_uptime(g.get("uptime", 0)),
            "disk_read_bps": round(rates["diskread"], 1),
            "disk_write_bps": round(rates["diskwrite"], 1),
            "net_in_bps": round(rates["netin"], 1),
            "net_out_bps": round(rates["netout"], 1),
            "ha_state": g.get("hastate", ""),
            "tags": [t for t in (g.get("tags") or "").split(";") if t],
        })

    # Neu RRD khong tra ve bang thong node, dung tong cua guest lam xap xi
    if net_in_bps == 0 and net_out_bps == 0:
        net_in_bps, net_out_bps = guest_net_in, guest_net_out

    # ── Storage pools (gop shared storage trung ten) ──────────────────
    storages: List[Dict[str, Any]] = []
    seen_shared = set()
    store_used = store_total = 0
    for s in storages_raw:
        sname = s.get("storage")
        shared = bool(s.get("shared"))
        dedupe_key = sname if shared else f"{s.get('node')}/{sname}"
        if dedupe_key in seen_shared:
            continue
        seen_shared.add(dedupe_key)
        used = int(s.get("disk") or 0)
        total = int(s.get("maxdisk") or 0)
        store_used += used
        store_total += total
        storages.append({
            "storage": sname,
            "node": s.get("node"),
            "type": s.get("plugintype", s.get("type", "")),
            "shared": shared,
            "status": s.get("status", "unknown"),
            "used": used,
            "total": total,
            "percent": _pct(used, total),
            "used_display": fmt_bytes(used),
            "total_display": fmt_bytes(total),
        })
    storages.sort(key=lambda x: x["percent"], reverse=True)

    # Fallback: chua co storage pool thi dung rootfs cua node
    disk_used = store_used or root_used
    disk_total = store_total or root_total

    # ── 4 vong tron chinh ─────────────────────────────────────────────
    cpu_percent = round(cpu_weighted / cpu_cores * 100, 1) if cpu_cores else 0.0
    ram_percent = _pct(mem_used, mem_total)
    disk_percent = _pct(disk_used, disk_total)
    bw_total_bps = net_in_bps + net_out_bps
    bw_percent = _pct(bw_total_bps, node_net_max_bps) if node_net_max_bps else 0.0

    gauges = [
        {
            "key": "disk", "label": "Dung lượng đĩa", "icon": "disk",
            "percent": disk_percent, "severity": _severity(disk_percent),
            "detail": f"{fmt_bytes(disk_used)} / {fmt_bytes(disk_total)}",
            "sub": f"{len(storages)} storage pool" if storages else "rootfs của node",
        },
        {
            "key": "cpu", "label": "CPU", "icon": "cpu",
            "percent": cpu_percent, "severity": _severity(cpu_percent),
            "detail": f"{round(cpu_weighted, 3)} / {int(cpu_cores)} core",
            "sub": f"Load 1m: {round(load1_total, 2)}",
        },
        {
            "key": "ram", "label": "RAM", "icon": "ram",
            "percent": ram_percent, "severity": _severity(ram_percent),
            "detail": f"{fmt_bytes(mem_used)} / {fmt_bytes(mem_total)}",
            "sub": f"Swap: {fmt_bytes(swap_used)} / {fmt_bytes(swap_total)}" if swap_total else "Không có swap",
        },
        {
            "key": "bandwidth", "label": "Băng thông", "icon": "net",
            "percent": bw_percent, "severity": _severity(bw_percent),
            "detail": f"↓ {fmt_bps(net_in_bps)}  ↑ {fmt_bps(net_out_bps)}",
            "sub": f"Uplink giả định {settings.NET_LINK_MBPS} Mbps",
        },
    ]

    # ── Tin hieu SOC ──────────────────────────────────────────────────
    soc = _collect_soc_signals()

    # ── Cac thanh "Tài nguyên khác" ───────────────────────────────────
    nodes_online = len([n for n in nodes if n["status"] == "online"])
    qemu_running = len([v for v in vms if v["type"] == "qemu" and v["status"] == "running"])
    qemu_total = len([v for v in vms if v["type"] == "qemu"])
    lxc_running = len([v for v in vms if v["type"] == "lxc" and v["status"] == "running"])
    lxc_total = len([v for v in vms if v["type"] == "lxc"])
    storages_ok = len([s for s in storages if s["status"] in ("available", "online", "active")])
    max_uptime = max([n["uptime"] or 0 for n in nodes], default=0)
    iops_est = (disk_read_bps + disk_write_bps) / 16384.0

    groups = [
        {
            "key": "core", "label": "Hạ tầng lõi",
            "items": [
                _bar("nodes", "Node online", nodes_online, len(nodes),
                     f"{nodes_online} / {len(nodes)}",
                     percent=_pct(nodes_online, len(nodes)) if nodes else 0,
                     severity="ok" if nodes and nodes_online == len(nodes) else "crit"),
                _bar("qemu", "VM (QEMU) đang chạy", qemu_running, qemu_total,
                     f"{qemu_running} / {qemu_total}", severity="info"),
                _bar("lxc", "LXC đang chạy", lxc_running, lxc_total,
                     f"{lxc_running} / {lxc_total}", severity="info"),
                _bar("storage_pools", "Storage pool khả dụng", storages_ok, len(storages),
                     f"{storages_ok} / {len(storages)}",
                     percent=_pct(storages_ok, len(storages)) if storages else 0,
                     severity="ok" if storages and storages_ok == len(storages) else
                              ("crit" if storages else "info")),
                _bar("load", "Load average (1m)", round(load1_total, 2), int(cpu_cores) or None,
                     f"{round(load1_total, 2)} / {int(cpu_cores)} core",
                     percent=_pct(load1_total, cpu_cores) if cpu_cores else None,
                     hint="Load vượt số core nghĩa là có tiến trình phải chờ CPU"),
                _bar("swap", "Swap đã dùng", swap_used, swap_total or None,
                     f"{fmt_bytes(swap_used)} / {fmt_bytes(swap_total)}" if swap_total else "Không có swap",
                     percent=_pct(swap_used, swap_total) if swap_total else None,
                     hint="Swap tăng liên tục là dấu hiệu thiếu RAM"),
                _bar("uptime", "Uptime lâu nhất", max_uptime, None,
                     fmt_uptime(max_uptime), severity="info"),
            ],
        },
        {
            "key": "io", "label": "I/O & Mạng",
            "items": [
                _bar("disk_read", "Disk read", round(disk_read_bps), None,
                     f"{fmt_bytes(disk_read_bps)}/s", severity="info",
                     hint="Tính từ chênh lệch counter giữa hai lần poll"),
                _bar("disk_write", "Disk write", round(disk_write_bps), None,
                     f"{fmt_bytes(disk_write_bps)}/s", severity="info"),
                _bar("iops", "IOPS (ước tính)", round(iops_est), None,
                     f"~{round(iops_est)} IOPS", severity="info",
                     hint="Ước tính từ throughput với block size 16 KiB — Proxmox API không trả IOPS trực tiếp"),
                _bar("netin", "Lưu lượng vào", round(net_in_bps), None,
                     fmt_bps(net_in_bps), severity="info"),
                _bar("netout", "Lưu lượng ra", round(net_out_bps), None,
                     fmt_bps(net_out_bps), severity="info"),
                _bar("bw_util", "Mức dùng uplink", round(bw_percent, 1), 100,
                     f"{round(bw_percent, 1)}% của {settings.NET_LINK_MBPS} Mbps",
                     percent=bw_percent),
            ],
        },
        {
            "key": "soc", "label": "Tín hiệu SOC",
            "items": [
                _bar("incidents_open", "Sự cố đang mở", soc["open_incidents"], None,
                     str(soc["open_incidents"]),
                     severity="crit" if soc["open_incidents"] > 0 else "ok"),
                _bar("incidents_crit", "Sự cố nghiêm trọng", soc["critical_incidents"], None,
                     str(soc["critical_incidents"]),
                     severity="crit" if soc["critical_incidents"] > 0 else "ok"),
                _bar("pending_actions", "Hành động chờ duyệt", soc["pending_actions"], None,
                     str(soc["pending_actions"]),
                     severity="warn" if soc["pending_actions"] > 0 else "ok"),
                _bar("ioc_events", "Sự kiện đe dọa 24h", soc["events_24h"], None,
                     str(soc["events_24h"]) if soc["events_24h"] is not None else "N/A",
                     severity="info"),
                _bar("ioc_cache", "IOC trong cache", soc["ioc_cached"], None,
                     f"{soc['ioc_cached']:,} IP", severity="info"),
                _bar("sensor", "Cảm biến eBPF", 1 if soc["sensor_active"] else 0, None,
                     "Đang thu thập" if soc["sensor_active"] else "Không có dữ liệu",
                     severity="ok" if soc["sensor_active"] else "warn"),
            ],
        },
        {
            "key": "ops", "label": "Vận hành host",
            "items": [
                _bar("backup", "Backup gần nhất", last_backup_ts, None,
                     _ago(last_backup_ts),
                     severity=_backup_severity(last_backup_ts),
                     hint="Lấy từ task vzdump gần nhất trên các node"),
                _bar("replication", "Job replication lỗi", repl_failed, None, str(repl_failed),
                     severity="crit" if repl_failed else "ok"),
                _bar("tasks", "Task đang chạy", running_tasks, None, str(running_tasks),
                     severity="info"),
                _bar("updates", "Gói cập nhật chờ", updates_pending, None, str(updates_pending),
                     severity="warn" if updates_pending else "ok"),
                _bar("certs", "Chứng chỉ sắp hết hạn", cert_soon, None, str(cert_soon),
                     severity="warn" if cert_soon else "ok",
                     hint="Ngưỡng 30 ngày"),
                _bar("services", "Dịch vụ lõi dừng", len(services_down), None,
                     ", ".join(services_down) if services_down else "Tất cả đang chạy",
                     severity="crit" if services_down else "ok"),
            ],
        },
    ]

    # ── Canh bao ──────────────────────────────────────────────────────
    warnings: List[Dict[str, str]] = []
    if not connected:
        warnings.append({"level": "crit",
                         "message": "Không kết nối được Proxmox API — kiểm tra PROXMOX_HOST và API token."})
    for g in gauges:
        if g["severity"] == "crit":
            warnings.append({"level": "crit",
                             "message": f"Mức sử dụng {g['label']} quá cao ({g['percent']}%)."})
        elif g["severity"] == "warn":
            warnings.append({"level": "warn",
                             "message": f"{g['label']} đang ở mức {g['percent']}%, cần theo dõi."})
    for s in storages:
        if s["percent"] >= settings.INFRA_CRIT_PERCENT:
            warnings.append({"level": "crit",
                             "message": f"Storage '{s['storage']}' trên {s['node']} đã dùng {s['percent']}%."})
    for n in nodes:
        if n["status"] != "online":
            warnings.append({"level": "crit", "message": f"Node {n['node']} đang offline."})
    if repl_failed:
        warnings.append({"level": "crit", "message": f"{repl_failed} job replication đang lỗi."})
    if services_down:
        warnings.append({"level": "crit",
                         "message": "Dịch vụ lõi đã dừng: " + ", ".join(services_down)})
    if soc["critical_incidents"]:
        warnings.append({"level": "crit",
                         "message": f"{soc['critical_incidents']} sự cố nghiêm trọng đang mở trong SOC."})
    if cert_soon:
        warnings.append({"level": "warn",
                         "message": f"{cert_soon} chứng chỉ sẽ hết hạn trong 30 ngày tới."})
    if updates_pending:
        warnings.append({"level": "warn",
                         "message": f"{updates_pending} gói cập nhật đang chờ trên các node."})

    return {
        "type": "infrastructure",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "connected": connected,
        "mock": bool(settings.MOCK_PROXMOX),
        "build_ms": int((time.time() - started) * 1000),
        "gauges": gauges,
        "groups": groups,
        "warnings": warnings,
        "storages": storages,
        "soc": soc,
        # Giu nguyen 2 khoa nay de Dashboard cu van chay
        "nodes": nodes,
        "vms": vms,
    }


def _ago(ts: Optional[int]) -> str:
    if not ts:
        return "Chưa có"
    delta = time.time() - float(ts)
    if delta < 3600:
        return f"{int(delta // 60)} phút trước"
    if delta < 86400:
        return f"{int(delta // 3600)} giờ trước"
    return f"{int(delta // 86400)} ngày trước"


def _backup_severity(ts: Optional[int]) -> str:
    if not ts:
        return "warn"
    delta = time.time() - float(ts)
    if delta > 7 * 86400:
        return "crit"
    if delta > 2 * 86400:
        return "warn"
    return "ok"


def _collect_soc_signals() -> Dict[str, Any]:
    out = {
        "open_incidents": 0,
        "critical_incidents": 0,
        "pending_actions": 0,
        "events_24h": None,
        "ioc_cached": 0,
        "sensor_active": False,
        "last_event": None,
    }
    try:
        from app.core.mongodb import mongodb_storage
        db = mongodb_storage.get_db()
        if db is not None:
            out["open_incidents"] = db.incidents.count_documents(
                {"status": {"$in": ["open", "investigating", "pending approval"]}})
            out["critical_incidents"] = db.incidents.count_documents(
                {"severity": "critical", "status": {"$ne": "resolved"}})
            out["pending_actions"] = db.action_requests.count_documents({"status": "pending"})
    except Exception as e:
        logger.debug(f"SOC signals (mongo) unavailable: {e}")

    try:
        from app.core.threat_intel import threat_intel_service
        out["ioc_cached"] = len(threat_intel_service.malicious_ips)
    except Exception:
        pass

    try:
        from app.core.pipeline import pipeline
        out["sensor_active"] = bool(pipeline.is_running and pipeline.last_event_time)
        if pipeline.last_event_time:
            out["last_event"] = pipeline.last_event_time.isoformat() + "Z"
            out["sensor_active"] = pipeline.last_event_time > datetime.utcnow() - timedelta(minutes=15)
    except Exception:
        pass

    try:
        from app.core.clickhouse import clickhouse_storage
        stats = clickhouse_storage.get_stats(minutes=1440) or {}
        if stats.get("total_events") is not None:
            out["events_24h"] = int(stats["total_events"])
    except Exception:
        pass

    return out
