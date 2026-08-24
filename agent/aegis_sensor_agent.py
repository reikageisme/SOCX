#!/usr/bin/env python3
"""
Aegis Sensor Agent — chay TREN HOST Proxmox (khong phai trong container).

Nhiem vu:
  1. Doc nhiet do (CPU, chipset, NVMe, SSD SATA), SMART va dien nang.
  2. Day so lieu ve backend ACS.
  3. Nhan chinh sach quat tu backend va ap dung tai cho.

Nguyen tac an toan (khong duoc pha vo khi sua code):
  - Vong dieu khien nam tron tren host. Mat mang hay backend chet thi bao ve
    qua nhiet VAN chay bang chinh sach luu cuc bo.
  - Tu dong chi duoc phep LAM MAT MANH HON. Khong co duong nao cho phan mem
    ha quat xuong khi nhiet dang cao.
  - Thoat ra (dung dich vu, Ctrl-C, crash) luon tra quat ve cho BIOS quan ly.

Chi dung thu vien chuan Python 3. Khong can pip install gi.
"""

import argparse
import atexit
import glob
import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

VERSION = "1.0.0"

# hp-wmi chi ho tro hai gia tri cho pwm1_enable
HP_PWM_MAX = 0      # tuoc quyen BIOS, quat chay het co
HP_PWM_AUTO = 2     # tra quyen dieu khien ve BIOS

DEFAULT_POLICY = {
    "mode": "auto",          # "auto" = BIOS lo, agent ep max khi nong | "max" = luon het co
    "on_celsius": 80.0,      # vuot nguong nay -> ep quat toi da
    "off_celsius": 70.0,     # ha xuong duoi nguong nay -> tra ve BIOS
    "enabled": True,         # False = khong bao gio ghi vao phan cung
}

STATE_DIR = "/var/lib/aegis-sensor-agent"
POLICY_FILE = os.path.join(STATE_DIR, "policy.json")


# ── Tien ich ──────────────────────────────────────────────────────────

def read_file(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:
        return None


def read_int(path):
    v = read_file(path)
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ── Kham pha hwmon (theo TEN chip, khong theo so thu tu) ─────────────
# Chi so hwmonN thay doi sau moi lan khoi dong lai, nen bam vao ten la bat buoc.

def hwmon_chips():
    chips = {}
    for d in sorted(glob.glob("/sys/class/hwmon/hwmon*")):
        name = read_file(f"{d}/name")
        if name:
            chips.setdefault(name, []).append(d)
    return chips


def find_fan_control():
    """Tim kenh dieu khien quat. Tra ve (duong_dan_pwm_enable, ten_driver) hoac (None, None)."""
    for d in sorted(glob.glob("/sys/class/hwmon/hwmon*")):
        name = read_file(f"{d}/name") or ""
        p = f"{d}/pwm1_enable"
        if os.path.exists(p):
            return p, name
    return None, None


TEMP_LABELS = {
    "coretemp": "CPU",
    "pch_cannonlake": "Chipset PCH",
    "pch_skylake": "Chipset PCH",
    "nvme": "NVMe",
    "drivetemp": "Ổ SATA",
    "k10temp": "CPU",
    "acpitz": "Bo mạch",
}


def read_temps():
    """Doc moi cam bien nhiet duoi /sys/class/hwmon."""
    out = []
    for d in sorted(glob.glob("/sys/class/hwmon/hwmon*")):
        chip = read_file(f"{d}/name") or "unknown"
        group = TEMP_LABELS.get(chip, chip)
        for inp in sorted(glob.glob(f"{d}/temp*_input")):
            base = inp[:-len("_input")]
            raw = read_int(inp)
            if raw is None:
                continue
            label = read_file(f"{base}_label") or os.path.basename(base)
            crit = read_int(f"{base}_crit")
            high = read_int(f"{base}_max")
            out.append({
                "key": f"{chip}:{os.path.basename(base)}",
                "chip": chip,
                "group": group,
                "label": label,
                "celsius": round(raw / 1000.0, 1),
                "high": round(high / 1000.0, 1) if high else None,
                "crit": round(crit / 1000.0, 1) if crit else None,
            })
    return out


def cpu_hotspot(temps):
    """Nhiet do CPU cao nhat — con so dung de quyet dinh bat quat."""
    vals = [t["celsius"] for t in temps if t["chip"] in ("coretemp", "k10temp")]
    return max(vals) if vals else None


# ── Dien nang qua Intel RAPL ─────────────────────────────────────────

_rapl_prev = {}


def read_power():
    domains = {}
    total = 0.0
    now = time.time()
    for p in sorted(glob.glob("/sys/class/powercap/intel-rapl:*")):
        name = read_file(f"{p}/name")
        energy = read_int(f"{p}/energy_uj")
        if not name or energy is None:
            continue
        prev = _rapl_prev.get(p)
        _rapl_prev[p] = (now, energy)
        if not prev:
            continue
        dt = now - prev[0]
        delta = energy - prev[1]
        if dt <= 0 or delta < 0:      # counter quay vong
            continue
        watts = round(delta / 1_000_000.0 / dt, 2)
        domains[name] = watts
        if ":" not in name and name.startswith("package"):
            total += watts
        elif name.startswith("package"):
            total += watts
    return {"watts": round(total, 2) if total else None, "domains": domains}


# ── SMART (cham, cache lau) ──────────────────────────────────────────

_smart_cache = {"ts": 0, "data": []}
SMART_TTL = 300


def read_smart():
    if time.time() - _smart_cache["ts"] < SMART_TTL:
        return _smart_cache["data"]

    disks = []
    try:
        listing = subprocess.run(
            ["lsblk", "-dn", "-o", "NAME,TYPE,MODEL,SIZE"],
            capture_output=True, text=True, timeout=10).stdout
    except Exception:
        listing = ""

    for line in listing.splitlines():
        parts = line.split(None, 3)
        if len(parts) < 2 or parts[1] != "disk":
            continue
        dev = parts[0]
        entry = {"device": dev, "model": (parts[3] if len(parts) > 3 else "").strip(),
                 "celsius": None, "power_on_hours": None, "percentage_used": None,
                 "health": None, "reallocated": None}
        try:
            raw = subprocess.run(["smartctl", "-j", "-A", "-H", f"/dev/{dev}"],
                                 capture_output=True, text=True, timeout=25).stdout
            j = json.loads(raw)
        except Exception:
            disks.append(entry)
            continue

        status = j.get("smart_status") or {}
        if "passed" in status:
            entry["health"] = "PASSED" if status["passed"] else "FAILED"

        temp = (j.get("temperature") or {}).get("current")
        if temp is not None:
            entry["celsius"] = float(temp)

        nvme = j.get("nvme_smart_health_information_log") or {}
        if nvme:
            entry["power_on_hours"] = nvme.get("power_on_hours")
            entry["percentage_used"] = nvme.get("percentage_used")
            if entry["celsius"] is None and nvme.get("temperature"):
                entry["celsius"] = float(nvme["temperature"])
        else:
            for attr in (j.get("ata_smart_attributes") or {}).get("table", []):
                name = (attr.get("name") or "").lower()
                val = (attr.get("raw") or {}).get("value")
                if name == "power_on_hours":
                    entry["power_on_hours"] = val
                elif "reallocated_sector" in name:
                    entry["reallocated"] = val
                elif name in ("wear_leveling_count", "ssd_life_left", "percent_lifetime_remain"):
                    normalized = attr.get("value")
                    if normalized is not None:
                        entry["percentage_used"] = max(0, 100 - int(normalized))
        disks.append(entry)

    _smart_cache["ts"] = time.time()
    _smart_cache["data"] = disks
    return disks


# ── Dieu khien quat ──────────────────────────────────────────────────

class FanController:
    def __init__(self, dry_run=False):
        self.path, self.driver = find_fan_control()
        self.dry_run = dry_run
        self.writable = bool(self.path and os.access(self.path, os.W_OK))
        self.forced = False          # agent co dang ep quat toi da khong
        self.last_error = None

    @property
    def supported(self):
        return bool(self.path)

    def raw(self):
        return read_int(self.path) if self.path else None

    def _write(self, value):
        if self.dry_run:
            log(f"[dry-run] se ghi {value} vao {self.path}")
            return True
        try:
            with open(self.path, "w") as f:
                f.write(str(value))
            self.last_error = None
            return True
        except Exception as e:
            self.last_error = str(e)
            log(f"LOI ghi {self.path}: {e}")
            return False

    def set_max(self):
        if not self.supported or self.forced:
            return
        if self._write(HP_PWM_MAX):
            self.forced = True
            log("QUAT: chuyen sang toi da")

    def set_auto(self):
        if not self.supported:
            return
        if self._write(HP_PWM_AUTO):
            if self.forced:
                log("QUAT: tra quyen dieu khien ve BIOS")
            self.forced = False

    def restore(self):
        """Luon goi khi thoat — khong bao gio de quat ket o che do ep."""
        if self.supported and self.forced:
            self._write(HP_PWM_AUTO)
            log("QUAT: khoi phuc che do BIOS truoc khi thoat")

    def state(self):
        raw = self.raw()
        return {
            "supported": self.supported,
            "writable": self.writable,
            "driver": self.driver,
            "path": self.path,
            "raw_enable": raw,
            "state": "max" if raw == HP_PWM_MAX else ("bios_auto" if raw == HP_PWM_AUTO else "unknown"),
            "forced_by_agent": self.forced,
            "rpm": None,
            "pwm_percent_supported": False,
            "note": ("Driver hp-wmi chỉ hỗ trợ hai nấc: BIOS tự điều khiển hoặc quạt tối đa. "
                     "Không đọc được vòng tua, không đặt được phần trăm PWM."),
            "error": self.last_error,
        }


def apply_policy(fan, policy, hotspot):
    """
    Quyet dinh trang thai quat.

    An toan: nhanh duy nhat ha quat xuong la khi nhiet da nam duoi off_celsius.
    Khong ton tai duong nao cho phep phan mem lam mat yeu di trong luc nhiet cao.
    """
    if not fan.supported or not policy.get("enabled", True):
        return "disabled"

    if policy.get("mode") == "max":
        fan.set_max()
        return "manual_max"

    if hotspot is None:
        return "no_reading"

    if hotspot >= float(policy.get("on_celsius", 80)):
        fan.set_max()
        return "auto_max"

    if fan.forced and hotspot <= float(policy.get("off_celsius", 70)):
        fan.set_auto()
        return "auto_released"

    if not fan.forced:
        return "bios_auto"
    return "auto_holding"   # dang trong vung tre, giu nguyen quat toi da


# ── Chinh sach: nho cuc bo de song sot khi mat backend ───────────────

def load_policy():
    data = dict(DEFAULT_POLICY)
    try:
        with open(POLICY_FILE) as f:
            data.update(json.load(f))
    except Exception:
        pass
    return data


def save_policy(policy):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(POLICY_FILE, "w") as f:
            json.dump(policy, f)
    except Exception as e:
        log(f"Khong luu duoc chinh sach: {e}")


def sanitize_policy(raw, fallback):
    """Khong tin tuong tuyet doi so lieu tu mang — chan moi gia tri vao khoang an toan."""
    if not isinstance(raw, dict):
        return fallback
    out = dict(fallback)
    if raw.get("mode") in ("auto", "max"):
        out["mode"] = raw["mode"]
    try:
        on = float(raw.get("on_celsius", out["on_celsius"]))
        off = float(raw.get("off_celsius", out["off_celsius"]))
        # Chan cung: khong cho dat nguong bat qua cao den muc vo dung
        out["on_celsius"] = min(max(on, 45.0), 95.0)
        out["off_celsius"] = min(max(off, 30.0), out["on_celsius"] - 3.0)
    except (TypeError, ValueError):
        pass
    if isinstance(raw.get("enabled"), bool):
        out["enabled"] = raw["enabled"]
    return out


# ── Day so lieu ve backend ───────────────────────────────────────────

def push(url, api_key, payload, timeout=10):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "X-API-Key": api_key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


# ── Vong chinh ───────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Aegis sensor agent (chay tren Proxmox host)")
    ap.add_argument("--url", default=os.environ.get("AEGIS_URL", ""),
                    help="Vi du: https://192.168.1.50 (dia chi CT chay SOC)")
    ap.add_argument("--api-key", default=os.environ.get("AEGIS_API_KEY", "aegis-dev-key"))
    ap.add_argument("--interval", type=float, default=float(os.environ.get("AEGIS_INTERVAL", 5)))
    ap.add_argument("--insecure", action="store_true", default=True,
                    help="Bo qua kiem tra chung chi (mac dinh bat vi SOC dung cert tu ky)")
    ap.add_argument("--dry-run", action="store_true", help="Khong ghi gi vao phan cung")
    ap.add_argument("--once", action="store_true", help="Chay mot vong roi in JSON va thoat")
    args = ap.parse_args()

    if args.insecure:
        import ssl
        ssl._create_default_https_context = ssl._create_unverified_context

    fan = FanController(dry_run=args.dry_run)
    policy = load_policy()

    # Bao ve: moi duong thoat deu tra quat ve cho BIOS
    atexit.register(fan.restore)

    def _bye(signum, _frame):
        log(f"Nhan tin hieu {signum}, dang thoat")
        fan.restore()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _bye)
    signal.signal(signal.SIGINT, _bye)

    host = read_file("/etc/hostname") or "pve"
    log(f"Aegis sensor agent {VERSION} — host={host}")
    log(f"Quat: {'co the dieu khien' if fan.writable else 'CHI DOC'} "
        f"(driver={fan.driver}, path={fan.path})")
    if not fan.supported:
        log("Bo mach khong phoi kenh dieu khien quat nao — agent chay o che do chi giam sat.")

    started = time.time()
    while True:
        cycle = time.time()
        temps = read_temps()
        hotspot = cpu_hotspot(temps)
        action = apply_policy(fan, policy, hotspot)

        payload = {
            "host": host,
            "ts": datetime.now(timezone.utc).isoformat(),
            "agent": {"version": VERSION, "uptime": int(time.time() - started)},
            "temps": temps,
            "cpu_hotspot": hotspot,
            "disks": read_smart(),
            "power": read_power(),
            "fan": fan.state(),
            "policy": policy,
            "action": action,
        }

        if args.once:
            print(json.dumps(payload, indent=2, ensure_ascii=False))
            return

        if args.url:
            try:
                resp = push(f"{args.url.rstrip('/')}/api/v1/sensors/ingest",
                            args.api_key, payload)
                new_policy = sanitize_policy(resp.get("policy"), policy)
                if new_policy != policy:
                    log(f"Chinh sach moi tu backend: {new_policy}")
                    policy = new_policy
                    save_policy(policy)
            except urllib.error.HTTPError as e:
                log(f"Backend tu choi ({e.code}) — giu chinh sach cuc bo")
            except Exception as e:
                log(f"Khong lien lac duoc backend ({e}) — giu chinh sach cuc bo")

        time.sleep(max(1.0, args.interval - (time.time() - cycle)))


if __name__ == "__main__":
    main()
