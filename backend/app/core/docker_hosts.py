"""Registry of Docker daemons reachable from the SOC.

CT-105 (this container) sees its own daemon through the mounted
/var/run/docker.sock. Other Proxmox LXC containers (CT-101, CT-103, ...) each
run their own daemon, so they are reached over SSH:

    DOCKER_HOSTS=ct-101=ssh://root@192.168.1.101,ct-103=ssh://root@192.168.1.103

The Proxmox API cannot read logs from inside an LXC, which is why this goes
through Docker's own remote API instead.
"""
import logging
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings

logger = logging.getLogger(__name__)

try:
    import docker
    from docker.errors import NotFound as DockerNotFound  # noqa: F401
    HAS_DOCKER = True
except Exception as e:  # pragma: no cover - docker lib missing
    logger.warning(f"docker SDK unavailable: {e}")
    docker = None
    HAS_DOCKER = False

LOCAL_URL = "local"
_RETRY_AFTER = 60.0  # seconds to wait before re-dialing a host that failed

_lock = threading.Lock()
_clients: Dict[str, Any] = {}
_errors: Dict[str, Tuple[str, float]] = {}  # name -> (message, timestamp)


def configured_hosts() -> Dict[str, str]:
    """Ordered mapping of host name -> docker base_url. Local is always first."""
    hosts: Dict[str, str] = {settings.DOCKER_LOCAL_NAME: LOCAL_URL}
    for item in (settings.DOCKER_HOSTS or "").split(","):
        item = item.strip()
        if not item:
            continue
        name, sep, url = item.partition("=")
        name, url = name.strip(), url.strip()
        if not sep or not name or not url:
            logger.warning(f"Ignoring malformed DOCKER_HOSTS entry: {item!r}")
            continue
        if name == settings.DOCKER_LOCAL_NAME:
            logger.warning(f"DOCKER_HOSTS entry {name!r} clashes with the local host name; ignored")
            continue
        hosts[name] = url
    return hosts


def resolve_hosts(host: Optional[str]) -> Dict[str, str]:
    """Turn the ?host= query value into the set of hosts to talk to."""
    hosts = configured_hosts()
    if not host or host == "all":
        return hosts
    if host not in hosts:
        raise KeyError(host)
    return {host: hosts[host]}


def is_remote(name: str) -> bool:
    """True when the host is reached over SSH rather than the local socket."""
    return configured_hosts().get(name, LOCAL_URL) != LOCAL_URL


def concurrency_for(name: str) -> int:
    """How many parallel Docker calls one host tolerates.

    Every call to a remote daemon rides its own SSH channel, and sshd caps
    those at MaxSessions (10 by default), so remote hosts get a small budget.
    """
    if is_remote(name):
        return max(1, settings.DOCKER_SSH_CONCURRENCY)
    return max(1, settings.DOCKER_LOCAL_CONCURRENCY)


def get_client(name: str):
    """Return a cached Docker client for `name`, or None if it is unreachable.

    A host that just failed is not re-dialed for _RETRY_AFTER seconds so one
    dead LXC does not slow down every request.
    """
    if not HAS_DOCKER:
        return None

    with _lock:
        client = _clients.get(name)
        if client is not None:
            return client
        failure = _errors.get(name)
        if failure and (time.time() - failure[1]) < _RETRY_AFTER:
            return None

    url = configured_hosts().get(name)
    if url is None:
        return None

    client = None
    try:
        if url == LOCAL_URL:
            client = docker.from_env(timeout=settings.DOCKER_TIMEOUT)
        else:
            # Every pooled connection holds an open SSH channel running
            # `docker system dial-stdio`, and sshd caps concurrent channels at
            # MaxSessions (10 by default). Keep the pool below that ceiling.
            client = docker.DockerClient(
                base_url=url,
                timeout=settings.DOCKER_TIMEOUT,
                use_ssh_client=settings.DOCKER_SSH_USE_CLI,
                max_pool_size=max(1, settings.DOCKER_SSH_CONCURRENCY) + 1,
            )
        client.ping()
    except Exception as e:
        logger.warning(f"Docker host {name!r} ({url}) unreachable: {e}")
        _close(client)
        with _lock:
            _errors[name] = (str(e), time.time())
            _clients.pop(name, None)
        return None

    with _lock:
        _clients[name] = client
        _errors.pop(name, None)
    return client


def _close(client) -> None:
    """Close a client so its SSH transport (and every channel on it) goes away.

    Dropping the reference is not enough: the remote sshd keeps counting those
    channels against MaxSessions until the transport actually closes, so a
    forgotten client permanently eats into the host's session budget.
    """
    if client is None:
        return
    try:
        client.close()
    except Exception as e:
        logger.debug(f"Closing docker client failed: {e}")


def drop_client(name: str, error: str = "") -> None:
    """Forget a client after an error so the next call re-dials."""
    with _lock:
        client = _clients.pop(name, None)
        if error:
            _errors[name] = (error, time.time())
    _close(client)


def last_error(name: str) -> Optional[str]:
    with _lock:
        failure = _errors.get(name)
    return failure[0] if failure else None


def host_status() -> List[Dict[str, Any]]:
    """Probe every configured host. Used by GET /system/hosts."""
    out: List[Dict[str, Any]] = []
    for name, url in configured_hosts().items():
        client = get_client(name)
        entry: Dict[str, Any] = {
            "name": name,
            "url": url,
            "kind": "local" if url == LOCAL_URL else url.split("://", 1)[0],
            "reachable": client is not None,
            "containers": 0,
            "error": None,
        }
        if client is not None:
            try:
                entry["containers"] = len(client.containers.list(all=True))
            except Exception as e:
                # SSH channel errors are transient (the daemon was momentarily
                # out of sessions); re-dial once before calling the host down.
                drop_client(name)
                retry = get_client(name)
                try:
                    if retry is None:
                        raise e
                    entry["containers"] = len(retry.containers.list(all=True))
                except Exception as e2:
                    entry["reachable"] = False
                    entry["error"] = str(e2)
                    drop_client(name, str(e2))
        else:
            entry["error"] = last_error(name) or "not connected"
        out.append(entry)
    return out
