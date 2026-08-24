#!/usr/bin/env python3
"""
Khao sat kha nang cam bien / dieu khien quat cua Proxmox host.

CHI DOC. Script nay khong ghi bat cu thu gi vao phan cung, khong nap module,
khong dung dich vu nao. Chay an toan tren may dang chay production.

    python3 sensor_discovery.py            # ban tom tat cho nguoi doc
    python3 sensor_discovery.py --json     # JSON day du de gui lai
"""

import glob
import json
import os
import shutil
import subprocess
import sys

TOOLS = ("sensors", "smartctl", "nvme", "ipmitool", "upsc", "pwmconfig", "fancontrol")


def run(cmd, timeout=20):
    try:
        p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return (p.stdout or p.stderr).strip()
    except Exception as e:
        return f"<error: {e}>"


def read(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:
        return None


def collect():
    out = {}
    out["kernel"] = run("uname -r")
    out["pve_version"] = run("pveversion 2>/dev/null | head -1")
    out["board"] = {
        "vendor": read("/sys/class/dmi/id/board_vendor"),
        "name": read("/sys/class/dmi/id/board_name"),
        "product": read("/sys/class/dmi/id/product_name"),
    }
    out["cpu"] = run("lscpu | grep -m1 'Model name' | cut -d: -f2- | xargs")
    out["tools"] = {t: bool(shutil.which(t)) for t in TOOLS}
    out["modules"] = run(
        "lsmod | grep -E '^(nct|it87|coretemp|k10temp|drivetemp|w83|f71|asus|dell_smm|acpi_power)' "
        "| awk '{print $1}'"
    ).split()

    # ── hwmon: nguon su that cho nhiet do, RPM va PWM ─────────────────
    hwmon = []
    for d in sorted(glob.glob("/sys/class/hwmon/hwmon*")):
        entry = {
            "path": d,
            "name": read(f"{d}/name"),
            "driver": os.path.basename(os.path.realpath(f"{d}/device/driver"))
            if os.path.exists(f"{d}/device/driver") else None,
            "temps": [], "fans": [], "pwm": [],
        }
        for f in sorted(glob.glob(f"{d}/temp*_input")):
            key = os.path.basename(f).rsplit("_", 1)[0]
            entry["temps"].append({
                "id": key,
                "label": read(f"{d}/{key}_label"),
                "celsius": (int(read(f)) / 1000.0) if (read(f) or "").lstrip("-").isdigit() else None,
                "crit": read(f"{d}/{key}_crit"),
                "max": read(f"{d}/{key}_max"),
            })
        for f in sorted(glob.glob(f"{d}/fan*_input")):
            key = os.path.basename(f).rsplit("_", 1)[0]
            entry["fans"].append({
                "id": key,
                "label": read(f"{d}/{key}_label"),
                "rpm": read(f),
                "min": read(f"{d}/{key}_min"),
            })
        for f in sorted(glob.glob(f"{d}/pwm[0-9]")):
            key = os.path.basename(f)
            en_path = f"{d}/{key}_enable"
            entry["pwm"].append({
                "id": key,
                "value": read(f),
                "writable": os.access(f, os.W_OK),
                "enable": read(en_path),
                "enable_writable": os.access(en_path, os.W_OK) if os.path.exists(en_path) else False,
                "mode": read(f"{d}/{key}_mode"),
            })
        if entry["temps"] or entry["fans"] or entry["pwm"]:
            hwmon.append(entry)
    out["hwmon"] = hwmon

    # ── lm-sensors (neu co) ───────────────────────────────────────────
    if shutil.which("sensors"):
        raw = run("sensors -j 2>/dev/null")
        try:
            out["sensors"] = json.loads(raw)
        except Exception:
            out["sensors_raw"] = run("sensors 2>/dev/null")[:4000]
    else:
        out["sensors"] = None

    # ── O dia ─────────────────────────────────────────────────────────
    disks = []
    for line in run("lsblk -dn -o NAME,TYPE,MODEL,SIZE,ROTA").splitlines():
        parts = line.split(None, 4)
        if len(parts) >= 2 and parts[1] == "disk":
            disks.append({"name": parts[0], "info": line})
    out["disks"] = disks
    if disks and shutil.which("smartctl"):
        first = disks[0]["name"]
        out["smartctl_sample"] = run(f"smartctl -j -A /dev/{first} 2>/dev/null")[:1500]
    if shutil.which("nvme"):
        out["nvme_list"] = run("nvme list 2>/dev/null")[:1000]

    # ── Dien nang ─────────────────────────────────────────────────────
    out["rapl"] = [
        {"path": p, "name": read(f"{p}/name"), "energy_uj": read(f"{p}/energy_uj")}
        for p in sorted(glob.glob("/sys/class/powercap/intel-rapl:*"))
        if read(f"{p}/energy_uj")
    ]
    if shutil.which("ipmitool"):
        out["ipmi_sensors"] = run("ipmitool sensor 2>/dev/null")[:3000]
        out["ipmi_fans"] = run("ipmitool sdr type fan 2>/dev/null")[:1500]
    if shutil.which("upsc"):
        ups = run("upsc -l 2>/dev/null").splitlines()
        out["ups"] = {u: run(f"upsc {u} 2>/dev/null")[:800] for u in ups[:3]}

    return out


def verdict(d):
    lines = []
    add = lines.append

    add("=" * 62)
    add("  KHAO SAT CAM BIEN — AEGIS SOC")
    add("=" * 62)
    b = d["board"]
    add(f"Bo mach : {b['vendor']} {b['name']}  ({b['product']})")
    add(f"CPU     : {d['cpu']}")
    add(f"Kernel  : {d['kernel']}   {d['pve_version']}")
    add(f"Cong cu : " + ", ".join(k for k, v in d["tools"].items() if v) or "(khong co gi)")
    if d["modules"]:
        add(f"Module  : {', '.join(d['modules'])}")
    add("")

    n_temp = sum(len(h["temps"]) for h in d["hwmon"])
    n_fan = sum(len(h["fans"]) for h in d["hwmon"])
    pwms = [(h, p) for h in d["hwmon"] for p in h["pwm"]]
    writable = [(h, p) for h, p in pwms if p["writable"] and p["enable_writable"]]

    add(f"[1] Nhiet do  : {n_temp} cam bien tren {len(d['hwmon'])} chip hwmon")
    for h in d["hwmon"]:
        for t in h["temps"][:6]:
            lbl = t["label"] or t["id"]
            add(f"      {h['name']:<12} {lbl:<20} {t['celsius']} C")
    add("")

    add(f"[2] Quat      : {n_fan} cam bien toc do")
    for h in d["hwmon"]:
        for f in h["fans"]:
            add(f"      {h['name']:<12} {(f['label'] or f['id']):<20} {f['rpm']} RPM")
    if not n_fan:
        add("      (khong doc duoc RPM qua hwmon)")
    add("")

    add(f"[3] Dieu khien: {len(pwms)} kenh PWM, {len(writable)} kenh GHI DUOC")
    for h, p in pwms:
        flag = "GHI DUOC" if (p["writable"] and p["enable_writable"]) else "chi doc"
        add(f"      {h['name']:<12} {p['id']:<6} value={p['value']:<4} "
            f"enable={p['enable']}  [{flag}]")
    add("")

    add("KET LUAN")
    if writable:
        add("  -> Chinh quat qua sysfs KHA THI. Se dung duong hwmon PWM.")
    elif d.get("ipmi_fans") and "Fan" in str(d.get("ipmi_fans", "")):
        add("  -> Khong co PWM qua sysfs, nhung CO IPMI. Phai dung lenh raw rieng cua hang.")
    else:
        add("  -> KHONG chinh duoc quat tu phan mem tren may nay.")
        add("     Chi lam duoc phan giam sat. Kiem tra BIOS/driver Super I/O truoc khi ket luan cuoi.")
    if not d["tools"]["sensors"]:
        add("  !  Chua cai lm-sensors: apt install lm-sensors && sensors-detect --auto")
    if not d["tools"]["smartctl"]:
        add("  !  Chua cai smartmontools (can cho nhiet o dia): apt install smartmontools")
    add("=" * 62)
    return "\n".join(lines)


if __name__ == "__main__":
    data = collect()
    if "--json" in sys.argv:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(verdict(data))
        print("\nChay lai voi --json de lay du lieu day du gui cho Claude.")
