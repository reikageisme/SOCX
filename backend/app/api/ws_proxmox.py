from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any
from app.core.websockets import ConnectionManager
import redis
import json

router = APIRouter()

# Use a separate ConnectionManager or the global one.
# For Proxmox, a dedicated manager is cleaner.
manager = ConnectionManager()

@router.websocket("/infrastructure")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    # Send initial state from cache
    try:
        redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)
        cached = redis_client.get("proxmox_last_payload")
        if cached:
            await websocket.send_text(cached)
    except Exception as e:
        print("Failed to send initial ws payload:", e)
        
    try:
        while True:
            # We don't expect the client to send anything, just keep the connection alive
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
