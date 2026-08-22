import json
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.websockets import ConnectionManager
from app.core.security import verify_token

router = APIRouter()
logger = logging.getLogger("websocket.infrastructure")

# Manager rieng cho luong ha tang (tach khoi luong threat-map)
manager = ConnectionManager()


@router.websocket("/infrastructure")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default=None)):
    """Luong du lieu ha tang Proxmox theo thoi gian thuc (yeu cau JWT)."""
    username, _role = verify_token(token)
    if username is None:
        logger.warning(f"[WS-INFRA] Tu choi ket noi: token khong hop le tu {websocket.client}")
        await websocket.close(code=4001, reason="Authentication required")
        return

    if not manager.can_connect(username):
        logger.warning(f"[WS-INFRA] Tu choi: '{username}' vuot gioi han ket noi")
        await websocket.close(code=4002, reason="Too many connections")
        return

    await manager.connect(websocket, username=username)

    # Gui ngay state gan nhat tu cache de UI khong phai cho het chu ky poll
    try:
        from app.core.proxmox_jobs import _get_redis
        redis_client = _get_redis()
        cached = redis_client.get("proxmox_last_payload") if redis_client else None
        if cached:
            await websocket.send_text(cached)
        else:
            from app.core.infra_overview import build_overview
            await websocket.send_text(json.dumps(build_overview(), default=str))
    except Exception as e:
        logger.warning(f"[WS-INFRA] Khong gui duoc state ban dau: {e}")

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"[WS-INFRA] '{username}' da ngat ket noi")
    except Exception as e:
        manager.disconnect(websocket)
        logger.error(f"[WS-INFRA] Loi voi '{username}': {e}")
