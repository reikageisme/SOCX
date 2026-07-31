from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any
from app.core.websockets import ConnectionManager

router = APIRouter()

# Use a separate ConnectionManager or the global one.
# For Proxmox, a dedicated manager is cleaner.
manager = ConnectionManager()

@router.websocket("/infrastructure")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We don't expect the client to send anything, just keep the connection alive
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
