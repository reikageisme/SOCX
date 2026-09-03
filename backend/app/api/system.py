from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
import logging
import re
from concurrent.futures import ThreadPoolExecutor
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
                "image": c.image.tags[0] if c.image.tags else c.image.id,
                "is_acs": c.name.startswith("acs-"),
            })
        # Return every container on the host. ACS-owned ones are flagged via
        # "is_acs" so the UI can group/highlight them instead of hiding the rest.
        result.sort(key=lambda x: (not x["is_acs"], x["name"]))
        return {"status": "success", "containers": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Docker prefixes each line with an RFC3339Nano timestamp when timestamps=True
_TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s?(.*)$", re.S)


def _parse_container_logs(container, lines: int):
    """Return a list of {ts, container, message} entries for one container."""
    name = container.name
    try:
        raw = container.logs(tail=lines, timestamps=True).decode("utf-8", errors="replace")
    except Exception as e:  # a single bad container must not kill the whole view
        return [{"ts": None, "container": name, "message": f"[unable to read logs: {e}]"}]

    entries = []
    last_ts = None
    for line in raw.splitlines():
        if not line.strip():
            continue
        m = _TS_RE.match(line)
        if m:
            last_ts = m.group(1)
            entries.append({"ts": last_ts, "container": name, "message": m.group(2)})
        else:
            # continuation line (stack trace etc.) - inherit previous timestamp
            entries.append({"ts": last_ts, "container": name, "message": line})
    return entries


@router.get("/containers/logs/all")
def get_all_container_logs(
    lines: int = 200,
    max_lines: int = 2000,
    running_only: bool = True,
    acs_only: bool = False,
    current_user: str = Depends(get_current_user),
):
    """Aggregate logs from every container on the host, merged by timestamp.

    - lines:        tail size fetched per container
    - max_lines:    hard cap on the merged result (newest kept)
    - running_only: skip stopped/exited containers
    - acs_only:     restrict to acs-* containers
    """
    if not HAS_DOCKER:
        return {"status": "error", "message": "Docker integration is not available."}

    lines = max(1, min(lines, 5000))
    max_lines = max(1, min(max_lines, 20000))

    try:
        containers = docker_client.containers.list(all=not running_only)
        if acs_only:
            containers = [c for c in containers if c.name.startswith("acs-")]
        if not containers:
            return {"status": "success", "containers": [], "entries": [], "logs": ""}

        entries = []
        with ThreadPoolExecutor(max_workers=min(8, len(containers))) as pool:
            for chunk in pool.map(lambda c: _parse_container_logs(c, lines), containers):
                entries.extend(chunk)

        # RFC3339Nano UTC strings sort correctly lexicographically
        entries.sort(key=lambda e: e["ts"] or "")
        if len(entries) > max_lines:
            entries = entries[-max_lines:]

        text = "\n".join(
            f"{e['ts'] or '-':<30} {e['container']:<20} | {e['message']}" for e in entries
        )
        return {
            "status": "success",
            "containers": [c.name for c in containers],
            "count": len(entries),
            "entries": entries,
            "logs": text,
        }
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
