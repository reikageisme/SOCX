import json
import logging
import uuid
from datetime import datetime, timedelta

from app.api.ws_proxmox import manager
from app.config import settings
from app.core.infra_overview import build_overview
from app.core.mongodb import mongodb_storage

logger = logging.getLogger("proxmox_jobs")

_redis_client = None
_redis_checked = False

# Chong spam incident: {khoa_canh_bao: thoi_diem_tao_gan_nhat}
_alert_debounce = {}
_ALERT_COOLDOWN = timedelta(minutes=30)


def _get_redis():
    """Tao client Redis mot lan duy nhat, degrade im lang neu khong co Redis."""
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    try:
        import redis
        client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True,
                             socket_connect_timeout=1, socket_timeout=1)
        client.ping()
        _redis_client = client
    except Exception as e:
        logger.info(f"Redis khong kha dung, bo qua cache payload: {e}")
        _redis_client = None
    return _redis_client


async def poll_proxmox_and_broadcast():
    """Poll Proxmox, day payload live qua WebSocket va sinh incident khi vuot nguong."""
    try:
        payload = build_overview()
    except Exception as e:
        logger.error(f"build_overview failed: {e}")
        return

    payload_json = json.dumps(payload, default=str)

    redis_client = _get_redis()
    if redis_client:
        try:
            # Cache de client moi ket noi nhan duoc state ngay lap tuc
            redis_client.set("proxmox_last_payload", payload_json, ex=120)
        except Exception as e:
            logger.debug(f"Redis set failed: {e}")

    # Luon broadcast: cac chi so toc do (I/O, bang thong) thay doi moi chu ky
    try:
        await manager.broadcast(payload_json)
    except Exception as e:
        logger.error(f"Broadcast failed: {e}")

    try:
        _raise_incidents(payload)
    except Exception as e:
        logger.error(f"Incident generation failed: {e}")


def _raise_incidents(payload):
    """Tao incident tu cac canh bao muc crit, co debounce theo thoi gian."""
    crit_warnings = [w for w in payload.get("warnings", []) if w.get("level") == "crit"]
    if not crit_warnings:
        return

    db = mongodb_storage.get_db()
    if db is None:
        return

    now = datetime.utcnow()
    for w in crit_warnings:
        message = w.get("message", "")
        # Bo qua canh bao co nguon goc tu chinh SOC de tranh vong lap incident
        if "sự cố nghiêm trọng" in message.lower():
            continue

        key = message[:120]
        last = _alert_debounce.get(key)
        if last and now - last < _ALERT_COOLDOWN:
            continue

        existing = db.incidents.find_one({
            "title": f"[Hạ tầng] {key}",
            "status": {"$ne": "resolved"},
        })
        if existing:
            _alert_debounce[key] = now
            continue

        db.incidents.insert_one({
            "id": str(uuid.uuid4()),
            "title": f"[Hạ tầng] {key}",
            "severity": "high",
            "status": "open",
            "created_at": now.isoformat() + "Z",
            "updated_at": now.isoformat() + "Z",
            "description": (
                f"Cảnh báo tự động từ giám sát hạ tầng Proxmox.\n\n{message}\n\n"
                f"Ngưỡng cảnh báo: {settings.INFRA_WARN_PERCENT}% / "
                f"nghiêm trọng: {settings.INFRA_CRIT_PERCENT}%."
            ),
            "source": "Infrastructure Monitor",
            "tags": ["infrastructure", "automated"],
        })
        _alert_debounce[key] = now
