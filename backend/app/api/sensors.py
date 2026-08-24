"""
API cam bien phan cung: nhan so lieu tu agent chay tren Proxmox host,
luu lich su, va quan ly chinh sach quat.

Luong du lieu:
    agent (tren pve)  --POST /sensors/ingest-->  backend  --tra ve chinh sach-->  agent
                                                    |
                                                    +--> WebSocket ha tang --> trang Infrastructure
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.endpoints import get_current_user, get_current_user_with_role
from app.config import settings
from app.core.mongodb import mongodb_storage

router = APIRouter()
logger = logging.getLogger("sensors")

# Ban doc gan nhat cua moi host, giu trong bo nho de WebSocket lay tuc thi
_latest: Dict[str, Dict[str, Any]] = {}

# Chi ghi lich su moi 60 giay du agent gui moi 5 giay
_last_persist: Dict[str, float] = {}
PERSIST_EVERY = 60.0
HISTORY_DAYS = 7

DEFAULT_POLICY = {
    "mode": "auto",
    "on_celsius": 80.0,
    "off_celsius": 70.0,
    "enabled": True,
}

_alert_debounce: Dict[str, datetime] = {}
ALERT_COOLDOWN = timedelta(minutes=30)


def require_api_key(x_api_key: Optional[str] = Header(None)):
    """Agent xac thuc bang API key noi bo, khong dung JWT."""
    if not x_api_key or x_api_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")
    return True


class FanPolicy(BaseModel):
    mode: str = Field(default="auto", pattern="^(auto|max)$")
    on_celsius: float = Field(default=80.0, ge=45.0, le=95.0)
    off_celsius: float = Field(default=70.0, ge=30.0, le=92.0)
    enabled: bool = True


def _db():
    return mongodb_storage.get_db()


def get_policy() -> Dict[str, Any]:
    db = _db()
    if db is None:
        return dict(DEFAULT_POLICY)
    doc = db.sensor_policy.find_one({"_id": "default"}, {"_id": 0})
    if not doc:
        return dict(DEFAULT_POLICY)
    merged = dict(DEFAULT_POLICY)
    merged.update({k: v for k, v in doc.items() if k in DEFAULT_POLICY})
    return merged


def _ensure_indexes(db):
    try:
        db.sensor_readings.create_index("ts", expireAfterSeconds=HISTORY_DAYS * 86400)
        db.sensor_readings.create_index([("host", 1), ("ts", -1)])
    except Exception as e:
        logger.debug(f"Khong tao duoc index: {e}")


def _raise_incidents(payload: Dict[str, Any]):
    """Sinh incident khi qua nhiet hoac o dia bao hong."""
    db = _db()
    if db is None:
        return

    host = payload.get("host", "unknown")
    now = datetime.utcnow()
    alerts: List[Dict[str, str]] = []

    for t in payload.get("temps", []):
        crit = t.get("crit")
        c = t.get("celsius")
        if crit and c and c >= crit - 2:
            alerts.append({
                "key": f"temp-{host}-{t.get('key')}",
                "title": f"[Nhiệt độ] {t.get('group')} / {t.get('label')} trên {host}: {c}°C",
                "severity": "critical",
                "desc": f"Ngưỡng nguy hiểm của cảm biến này là {crit}°C. Giá trị hiện tại {c}°C.",
            })

    for d in payload.get("disks", []):
        if d.get("health") == "FAILED":
            alerts.append({
                "key": f"smart-{host}-{d.get('device')}",
                "title": f"[Ổ đĩa] SMART báo lỗi trên /dev/{d.get('device')}",
                "severity": "critical",
                "desc": f"Model {d.get('model')}. Sao lưu dữ liệu và thay ổ ngay.",
            })
        used = d.get("percentage_used")
        if isinstance(used, (int, float)) and used >= 90:
            alerts.append({
                "key": f"wear-{host}-{d.get('device')}",
                "title": f"[Ổ đĩa] /dev/{d.get('device')} đã hao mòn {used}%",
                "severity": "high",
                "desc": "Ổ SSD sắp hết tuổi thọ ghi. Lên kế hoạch thay thế.",
            })

    for a in alerts:
        last = _alert_debounce.get(a["key"])
        if last and now - last < ALERT_COOLDOWN:
            continue
        if db.incidents.find_one({"title": a["title"], "status": {"$ne": "resolved"}}):
            _alert_debounce[a["key"]] = now
            continue
        db.incidents.insert_one({
            "id": str(uuid.uuid4()),
            "title": a["title"],
            "severity": a["severity"],
            "status": "open",
            "created_at": now.isoformat() + "Z",
            "updated_at": now.isoformat() + "Z",
            "description": a["desc"],
            "source": "Sensor Agent",
            "tags": ["hardware", "automated"],
        })
        _alert_debounce[a["key"]] = now


@router.post("/ingest")
def ingest(payload: Dict[str, Any], _: bool = Depends(require_api_key)):
    """
    Agent goi endpoint nay moi chu ky. Phan hoi tra ve chinh sach quat hien hanh,
    nen agent chi can mot luot HTTP cho ca gui va nhan.
    """
    host = payload.get("host") or "unknown"
    payload["received_at"] = datetime.now(timezone.utc).isoformat()
    _latest[host] = payload

    db = _db()
    if db is not None:
        now = datetime.utcnow()
        if host not in _last_persist:
            _ensure_indexes(db)
        import time as _time
        if _time.time() - _last_persist.get(host, 0) >= PERSIST_EVERY:
            _last_persist[host] = _time.time()
            try:
                db.sensor_readings.insert_one({
                    "host": host,
                    "ts": now,
                    "cpu_hotspot": payload.get("cpu_hotspot"),
                    "temps": [
                        {"key": t.get("key"), "celsius": t.get("celsius")}
                        for t in payload.get("temps", [])
                    ],
                    "power_watts": (payload.get("power") or {}).get("watts"),
                    "fan_state": (payload.get("fan") or {}).get("state"),
                })
            except Exception as e:
                logger.debug(f"Khong ghi duoc lich su: {e}")

        try:
            _raise_incidents(payload)
        except Exception as e:
            logger.error(f"Loi sinh incident tu cam bien: {e}")

    return {"status": "ok", "policy": get_policy()}


@router.get("/latest")
def latest(current_user: str = Depends(get_current_user)):
    """So lieu cam bien moi nhat cua tat ca host co agent."""
    stale_after = 60
    now = datetime.now(timezone.utc)
    hosts = []
    for host, p in _latest.items():
        try:
            age = (now - datetime.fromisoformat(p["received_at"])).total_seconds()
        except Exception:
            age = None
        hosts.append({**p, "age_seconds": age,
                      "stale": bool(age is not None and age > stale_after)})
    return {"status": "success", "data": {"hosts": hosts, "policy": get_policy()}}


@router.get("/history")
def history(minutes: int = Query(default=180, ge=5, le=10080),
            host: Optional[str] = None,
            current_user: str = Depends(get_current_user)):
    """Chuoi thoi gian de ve do thi. Diem duoc ghi moi 60 giay."""
    db = _db()
    if db is None:
        return {"status": "success", "data": []}
    q: Dict[str, Any] = {"ts": {"$gte": datetime.utcnow() - timedelta(minutes=minutes)}}
    if host:
        q["host"] = host
    rows = list(db.sensor_readings.find(q, {"_id": 0}).sort("ts", 1).limit(5000))
    for r in rows:
        if isinstance(r.get("ts"), datetime):
            r["ts"] = r["ts"].isoformat() + "Z"
    return {"status": "success", "data": rows}


@router.get("/policy")
def read_policy(current_user: str = Depends(get_current_user)):
    return {"status": "success", "data": get_policy()}


@router.put("/policy")
def write_policy(policy: FanPolicy, user: dict = Depends(get_current_user_with_role)):
    """Doi chinh sach quat. Chi vai tro quan tri cao nhat duoc phep."""
    if user["role"] not in ("superadmin", "Super_Administrator", "DevOps_Engineer"):
        raise HTTPException(status_code=403, detail="Không đủ quyền thay đổi chính sách quạt")

    if policy.off_celsius >= policy.on_celsius - 3:
        raise HTTPException(
            status_code=400,
            detail="Ngưỡng tắt phải thấp hơn ngưỡng bật ít nhất 3°C để tránh quạt bật tắt liên tục",
        )

    db = _db()
    if db is None:
        raise HTTPException(status_code=503, detail="Chưa kết nối được cơ sở dữ liệu")

    doc = policy.model_dump()
    doc["updated_by"] = user["username"]
    doc["updated_at"] = datetime.utcnow().isoformat() + "Z"
    db.sensor_policy.update_one({"_id": "default"}, {"$set": doc}, upsert=True)

    logger.info(f"Chinh sach quat doi boi {user['username']}: {doc}")
    return {"status": "success", "data": get_policy(),
            "note": "Agent sẽ nhận chính sách mới ở chu kỳ kế tiếp (trong vòng ~5 giây)."}


def latest_snapshot() -> Dict[str, Any]:
    """Dung boi infra_overview de gop cam bien vao payload WebSocket."""
    now = datetime.now(timezone.utc)
    hosts = []
    for host, p in _latest.items():
        try:
            age = (now - datetime.fromisoformat(p["received_at"])).total_seconds()
        except Exception:
            age = None
        hosts.append({
            "host": host,
            "age_seconds": age,
            "stale": bool(age is not None and age > 60),
            "cpu_hotspot": p.get("cpu_hotspot"),
            "temps": p.get("temps", []),
            "disks": p.get("disks", []),
            "power": p.get("power", {}),
            "fan": p.get("fan", {}),
            "action": p.get("action"),
        })
    return {"hosts": hosts, "policy": get_policy(), "agent_connected": bool(hosts)}
