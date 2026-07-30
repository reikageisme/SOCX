from fastapi import APIRouter, Depends, HTTPException
from typing import List
import logging
from app.api.endpoints import get_current_user
from app.services.discord import discord_service
from pydantic import BaseModel
import subprocess

router = APIRouter()
logger = logging.getLogger(__name__)

try:
    import docker
    # Connect to the local Docker daemon
    docker_client = docker.from_env()
    HAS_DOCKER = True
except Exception as e:
    logger.warning(f"Failed to connect to Docker daemon: {e}")
    HAS_DOCKER = False

@router.get("/containers")
def list_containers(current_user: str = Depends(get_current_user)):
    """List all Docker containers."""
    if not HAS_DOCKER:
        return {"status": "error", "message": "Docker integration is not available."}
    
    try:
        containers = docker_client.containers.list(all=True)
        result = []
        for c in containers:
            result.append({
                "id": c.short_id,
                "name": c.name,
                "status": c.status,
                "image": c.image.tags[0] if c.image.tags else c.image.id
            })
        # Optionally filter to only ACS containers
        acs_containers = [c for c in result if c["name"].startswith("acs-")]
        if not acs_containers:
            acs_containers = result # Fallback to all if no acs- prefix found
            
        return {"status": "success", "containers": acs_containers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/containers/{container_name}/logs")
def get_container_logs(container_name: str, lines: int = 500, current_user: str = Depends(get_current_user)):
    """Fetch logs from a specific Docker container."""
    if not HAS_DOCKER:
        return {"status": "error", "message": "Docker integration is not available."}
    
    try:
        container = docker_client.containers.get(container_name)
        logs = container.logs(tail=lines, timestamps=True).decode('utf-8')
        return {"status": "success", "container": container_name, "logs": logs}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DiscordTestRequest(BaseModel):
    category: str
    message: str = "🚨 <b>TEST ALERT</b> 🚨\n\nThis is a test message from ACE SOC."

@router.post("/discord/test")
def test_discord(req: DiscordTestRequest, current_user: str = Depends(get_current_user)):
    embeds = [{
        "title": "ACE SOC System Test",
        "description": req.message,
        "color": 3447003 # Blue
    }]
    content = ""
    if req.category == "critical-alerts":
        content = "@here 🚨 CRITICAL ALERT TEST"
        embeds[0]["color"] = 15158332 # Red

    success = discord_service.send_alert(req.category, content=content, embeds=embeds)
    if success:
        return {"status": "success", "message": f"Test message sent to #{req.category}"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send message to Discord.")
