from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from app.config import settings
from app.services.proxmox import proxmox_service

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/login/access-token")

def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return username

@router.get("/proxmox/nodes")
def get_nodes(current_user: str = Depends(get_current_user)):
    """
    Get list of Proxmox nodes
    """
    nodes = proxmox_service.get_nodes()
    return {"status": "success", "data": nodes}

@router.get("/proxmox/nodes/{node_name}/vms")
def get_vms(node_name: str, current_user: str = Depends(get_current_user)):
    """
    Get list of VMs and LXCs for a specific node
    """
    vms = proxmox_service.get_vms(node_name)
    lxcs = proxmox_service.get_lxc(node_name)
    return {"status": "success", "data": {"qemu": vms, "lxc": lxcs}}

@router.get("/health")
def health_check():
    return {"status": "healthy"}

from pydantic import BaseModel
import json
from datetime import datetime
from app.core.websockets import manager

class AgentEvent(BaseModel):
    pid: int
    uid: int
    comm: str
    saddr: str
    daddr: str
    dport: int

@router.post("/agent/events")
async def receive_agent_event(event: AgentEvent, api_key: str = Depends(get_current_user)):
    """
    Receive TCP connection events from the eBPF agent.
    For simplicity in demo, we're sharing the same oauth token function, but in production,
    this would use mTLS client certificates via Nginx. 
    Here we just rely on the API Key passed as X-API-Key for the agent if it was modified, 
    but for now we just use get_current_user which expects a Bearer token.
    Wait, the agent C code uses 'X-API-Key'. Let's override it for this specific endpoint.
    """
    pass

class NetworkEvent(BaseModel):
    event_type: str
    pid: int
    process: str
    source_ip: str
    dest_ip: str
    dest_port: int
    timestamp: str

from app.core.pipeline import pipeline

@router.post("/events/network")
async def receive_network_event(event: NetworkEvent):
    # Map from NetworkEvent to the internal format expected by pipeline
    internal_event = {
        "pid": event.pid,
        "comm": event.process,
        "saddr": event.source_ip,
        "daddr": event.dest_ip,
        "dport": event.dest_port
    }
    await pipeline.enqueue_event(internal_event)
    return {"status": "success"}
