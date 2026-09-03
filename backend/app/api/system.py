from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Any, Dict, List, Optional
import logging
import re
from concurrent.futures import ThreadPoolExecutor

from app.api.endpoints import get_current_user
from app.services.discord import discord_service
from app.core import docker_hosts
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)

HAS_DOCKER = docker_hosts.HAS_DOCKER

# Docker prefixes each line with an RFC3339Nano timestamp when timestamps=True
_TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s?(.*)$", re.S)

_NO_DOCKER = {"status": "error", "message": "Docker integration is not available."}


def _resolve(host: Optional[str]) -> Dict[str, str]:
    try:
        return docker_hosts.resolve_hosts(host)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown docker host: {host}")


@router.get("/hosts")
def list_hosts(current_user: str = Depends(get_current_user)):
    """Every Docker daemon the SOC knows about, with reachability."""
    if not HAS_DOCKER:
        return _NO_DOCKER
    return {"status": "success", "hosts": docker_hosts.host_status()}


def _image_name(container) -> str:
    """Image reference taken from data already fetched with the container.

    Never touch `container.image`: that triggers an extra inspect call which
    404s for containers whose image was untagged or deleted, which would
    otherwise take down the listing for the whole host.
    """
    attrs = getattr(container, "attrs", None) or {}
    config = attrs.get("Config") or {}
    return config.get("Image") or attrs.get("Image") or ""


def _list_on(host: str) -> List[Dict[str, Any]]:
    try:
        containers = docker_hosts.call(host, lambda c: c.containers.list(all=True))
    except Exception as e:
        logger.warning(f"Listing containers on {host!r} failed: {e}")
        return []

    out = []
    for c in containers:
        try:
            out.append({
                "id": c.short_id,
                "name": c.name,
                "host": host,
                "key": f"{host}::{c.name}",
                "status": c.status,
                "image": _image_name(c),
                "is_acs": c.name.startswith("acs-"),
            })
        except Exception as e:  # one odd container must not hide the rest
            logger.warning(f"Skipping container on {host!r}: {e}")
    return out


@router.get("/containers")
def list_containers(
    host: Optional[str] = Query(default="all", description="Host name, or 'all'"),
    current_user: str = Depends(get_current_user),
):
    """List containers across every configured Docker host."""
    if not HAS_DOCKER:
        return _NO_DOCKER

    targets = _resolve(host)
    try:
        result: List[Dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=min(8, len(targets))) as pool:
            for chunk in pool.map(_list_on, list(targets)):
                result.extend(chunk)

        # ACS-owned containers first, then by host and name
        result.sort(key=lambda x: (not x["is_acs"], x["host"], x["name"]))
        unreachable = [
            {"host": h, "error": docker_hosts.last_error(h) or "not connected"}
            for h in targets
            if docker_hosts.get_client(h) is None
        ]
        return {"status": "success", "containers": result, "unreachable": unreachable}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _parse_container_logs(host: str, container_id: str, name: str, lines: int) -> List[Dict[str, Any]]:
    """Return a list of {ts, host, container, message} entries for one container.

    Addressed by id through the low-level API: a retry inside call() hands back
    a brand new client, and a Container object bound to the discarded one would
    keep talking to the dead transport.
    """
    try:
        raw = docker_hosts.call(
            host, lambda c: c.api.logs(container_id, tail=lines, timestamps=True)
        ).decode("utf-8", errors="replace")
    except Exception as e:  # a single bad container must not kill the whole view
        return [{"ts": None, "host": host, "container": name,
                 "message": f"[unable to read logs: {e}]"}]

    entries = []
    last_ts = None
    for line in raw.splitlines():
        if not line.strip():
            continue
        m = _TS_RE.match(line)
        if m:
            last_ts = m.group(1)
            entries.append({"ts": last_ts, "host": host, "container": name, "message": m.group(2)})
        else:
            # continuation line (stack trace etc.) - inherit previous timestamp
            entries.append({"ts": last_ts, "host": host, "container": name, "message": line})
    return entries


def _logs_on(host: str, lines: int, running_only: bool, acs_only: bool) -> List[Dict[str, Any]]:
    try:
        containers = docker_hosts.call(host, lambda c: c.containers.list(all=not running_only))
    except docker_hosts.DockerHostUnavailable as e:
        return [{"ts": None, "host": host, "container": "-",
                 "message": f"[host unreachable: {e}]"}]
    except Exception as e:
        return [{"ts": None, "host": host, "container": "-", "message": f"[host error: {e}]"}]

    if acs_only:
        containers = [c for c in containers if c.name.startswith("acs-")]
    if not containers:
        return []

    targets = [(c.id, c.name) for c in containers]
    entries: List[Dict[str, Any]] = []
    workers = min(docker_hosts.concurrency_for(host), len(targets))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for chunk in pool.map(lambda t: _parse_container_logs(host, t[0], t[1], lines), targets):
            entries.extend(chunk)
    return entries


@router.get("/containers/logs/all")
def get_all_container_logs(
    lines: int = 200,
    max_lines: int = 2000,
    running_only: bool = True,
    acs_only: bool = False,
    host: Optional[str] = Query(default="all", description="Host name, or 'all'"),
    current_user: str = Depends(get_current_user),
):
    """Aggregate logs from every container on one or all hosts, merged by timestamp.

    - lines:        tail size fetched per container
    - max_lines:    hard cap on the merged result (newest kept)
    - running_only: skip stopped/exited containers
    - acs_only:     restrict to acs-* containers
    - host:         a configured host name, or 'all'
    """
    if not HAS_DOCKER:
        return _NO_DOCKER

    lines = max(1, min(lines, 5000))
    max_lines = max(1, min(max_lines, 20000))
    targets = _resolve(host)

    try:
        entries: List[Dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=min(8, len(targets))) as pool:
            for chunk in pool.map(
                lambda h: _logs_on(h, lines, running_only, acs_only), list(targets)
            ):
                entries.extend(chunk)

        # RFC3339Nano UTC strings sort correctly lexicographically
        entries.sort(key=lambda e: e["ts"] or "")
        if len(entries) > max_lines:
            entries = entries[-max_lines:]

        text = "\n".join(
            f"{e['ts'] or '-':<30} {e['host']}/{e['container']:<20} | {e['message']}"
            for e in entries
        )
        return {
            "status": "success",
            "hosts": list(targets),
            "count": len(entries),
            "entries": entries,
            "logs": text,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers/{container_name}/logs")
def get_container_logs(
    container_name: str,
    lines: int = 500,
    host: Optional[str] = Query(default=None, description="Host name; defaults to the local daemon"),
    current_user: str = Depends(get_current_user),
):
    """Fetch logs from a specific container on a specific host."""
    if not HAS_DOCKER:
        return _NO_DOCKER

    from app.config import settings
    target = host or settings.DOCKER_LOCAL_NAME
    _resolve(target)  # validates the name

    try:
        container = docker_hosts.call(target, lambda c: c.containers.get(container_name))
        entries = _parse_container_logs(target, container.id, container.name, lines)
        return {
            "status": "success",
            "host": target,
            "container": container_name,
            "count": len(entries),
            "entries": entries,
            "logs": "\n".join(f"{e['ts'] or '-'} {e['message']}" for e in entries),
        }
    except docker_hosts.DockerHostUnavailable as e:
        raise HTTPException(status_code=502, detail=f"Docker host '{target}' unreachable: {e}")
    except Exception as e:
        if e.__class__.__name__ == "NotFound":
            raise HTTPException(status_code=404, detail="Container not found")
        raise HTTPException(status_code=500, detail=str(e))


class DiscordTestRequest(BaseModel):
    category: str
    message: str = "🚨 <b>TEST ALERT</b> 🚨\n\nThis is a test message from ACE SOC."


@router.post("/discord/test")
def test_discord(req: DiscordTestRequest, current_user: str = Depends(get_current_user)):
    embeds = [{
        "title": "ACE SOC System Test",
        "description": req.message,
        "color": 3447003  # Blue
    }]
    content = ""
    if req.category == "critical-alerts":
        content = "@here 🚨 CRITICAL ALERT TEST"
        embeds[0]["color"] = 15158332  # Red

    success = discord_service.send_alert(req.category, content=content, embeds=embeds)
    if success:
        return {"status": "success", "message": f"Test message sent to #{req.category}"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send message to Discord.")
