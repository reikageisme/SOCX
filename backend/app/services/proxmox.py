import time
import threading
from typing import Any, Dict, List, Optional

from proxmoxer import ProxmoxAPI
from app.config import settings


_MOCK_T0 = time.time()


def _mock_counter(rate_bytes_per_sec: float, base: float = 0.0) -> int:
    """Counter tich luy gia lap de cac chi so toc do co gia tri o che do MOCK."""
    return int(base + (time.time() - _MOCK_T0) * rate_bytes_per_sec)


class _TTLCache:
    """Cache rat nho gon cho cac endpoint Proxmox cham (apt, certificates, tasks...)."""

    def __init__(self):
        self._data: Dict[str, Any] = {}
        self._lock = threading.Lock()

    def get(self, key: str, ttl: float):
        with self._lock:
            item = self._data.get(key)
        if not item:
            return None
        ts, value = item
        if time.time() - ts > ttl:
            return None
        return value

    def set(self, key: str, value: Any):
        with self._lock:
            self._data[key] = (time.time(), value)


class ProxmoxService:
    def __init__(self):
        self.proxmox = None
        self._cache = _TTLCache()
        self._connect()

    def _connect(self):
        try:
            self.proxmox = ProxmoxAPI(
                settings.PROXMOX_HOST,
                user=settings.PROXMOX_USER,
                token_name=settings.PROXMOX_TOKEN_ID,
                token_value=settings.PROXMOX_TOKEN_SECRET,
                verify_ssl=settings.PROXMOX_VERIFY_SSL,
            )
        except Exception as e:
            self.proxmox = None
            print(f"Error connecting to Proxmox: {str(e)}")

    def _api(self):
        """Tra ve client Proxmox, tu dong reconnect neu can. None neu that bai."""
        if not self.proxmox:
            self._connect()
        return self.proxmox

    def _cached(self, key: str, ttl: float, loader, default):
        cached = self._cache.get(key, ttl)
        if cached is not None:
            return cached
        try:
            value = loader()
        except Exception as e:
            print(f"[proxmox] {key} failed: {e}")
            return default
        self._cache.set(key, value)
        return value

    # ── Core inventory ────────────────────────────────────────────────

    def get_nodes(self):
        if settings.MOCK_PROXMOX:
            return [
                {"node": "pve-node-01", "status": "online", "cpu": 0.14, "maxcpu": 16,
                 "mem": 12_884_901_888, "maxmem": 34_359_738_368,
                 "disk": 152_000_000_000, "maxdisk": 214_748_364_800, "uptime": 1_209_600},
                {"node": "pve-node-02", "status": "online", "cpu": 0.06, "maxcpu": 8,
                 "mem": 4_294_967_296, "maxmem": 17_179_869_184,
                 "disk": 61_000_000_000, "maxdisk": 214_748_364_800, "uptime": 864_000},
            ]
        api = self._api()
        if not api:
            return []
        try:
            return api.nodes.get()
        except Exception as e:
            print(f"Error fetching nodes: {str(e)}")
            return []

    def get_vms(self, node_name: str):
        if settings.MOCK_PROXMOX:
            return [{"vmid": 100, "name": "web-server", "status": "running"}]
        api = self._api()
        if not api:
            return []
        try:
            return api.nodes(node_name).qemu.get()
        except Exception as e:
            print(f"Error fetching VMs for node {node_name}: {str(e)}")
            return []

    def get_lxc(self, node_name: str):
        if settings.MOCK_PROXMOX:
            return [{"vmid": 200, "name": "db-container", "status": "running"}]
        api = self._api()
        if not api:
            return []
        try:
            return api.nodes(node_name).lxc.get()
        except Exception as e:
            print(f"Error fetching LXC for node {node_name}: {str(e)}")
            return []

    def execute_vm_action(self, node_name: str, vmid: int, action: str):
        if settings.MOCK_PROXMOX:
            return {"status": "mock_success", "action": action, "vmid": vmid}
        api = self._api()
        if not api:
            raise Exception("Not connected to Proxmox")

        # Proxmox API allows start, stop, shutdown, reboot, suspend, resume
        # Path: /nodes/{node}/qemu/{vmid}/status/{action} or lxc/{vmid}
        try:
            # Try QEMU first, if fails try LXC
            try:
                res = api.nodes(node_name).qemu(vmid).status.post(action)
            except Exception:
                res = api.nodes(node_name).lxc(vmid).status.post(action)
            return res
        except Exception as e:
            raise Exception(f"Failed to execute {action} on VM {vmid}: {str(e)}")

    def get_rrddata(self, node_name: str, timeframe: str = "hour"):
        if settings.MOCK_PROXMOX:
            now = int(time.time())
            return [
                {"time": now - (59 - i) * 60,
                 "cpu": 0.10 + (i % 7) * 0.01,
                 "memused": 12_000_000_000 + (i % 5) * 250_000_000,
                 "memtotal": 34_359_738_368,
                 "netin": 5_500_000 + (i % 11) * 400_000,
                 "netout": 2_100_000 + (i % 9) * 250_000,
                 "loadavg": 1.2 + (i % 4) * 0.2,
                 "iowait": 0.01,
                 "rootused": 152_000_000_000,
                 "roottotal": 214_748_364_800,
                 "swapused": 0, "swaptotal": 8_589_934_592}
                for i in range(60)
            ]
        api = self._api()
        if not api:
            return []
        try:
            return api.nodes(node_name).rrddata.get(timeframe=timeframe)
        except Exception as e:
            print(f"Error fetching RRD for node {node_name}: {str(e)}")
            return []

    # ── Mo rong: du lieu cho trang Infrastructure ─────────────────────

    def get_cluster_resources(self) -> List[Dict[str, Any]]:
        """/cluster/resources — mot lan goi lay ca node, qemu, lxc, storage."""
        if settings.MOCK_PROXMOX:
            return [
                {"type": "node", "node": "pve-node-01", "status": "online", "cpu": 0.14,
                 "maxcpu": 16, "mem": 12_884_901_888, "maxmem": 34_359_738_368,
                 "disk": 152_000_000_000, "maxdisk": 214_748_364_800, "uptime": 1_209_600},
                {"type": "node", "node": "pve-node-02", "status": "online", "cpu": 0.06,
                 "maxcpu": 8, "mem": 4_294_967_296, "maxmem": 17_179_869_184,
                 "disk": 61_000_000_000, "maxdisk": 214_748_364_800, "uptime": 864_000},
                {"type": "qemu", "vmid": 100, "name": "web-server", "node": "pve-node-01",
                 "status": "running", "cpu": 0.08, "maxcpu": 4, "mem": 2_147_483_648,
                 "maxmem": 4_294_967_296, "disk": 0, "maxdisk": 53_687_091_200,
                 "diskread": _mock_counter(4_200_000, 900_000_000),
                 "diskwrite": _mock_counter(1_800_000, 450_000_000),
                 "netin": _mock_counter(2_600_000, 8_500_000_000),
                 "netout": _mock_counter(1_100_000, 3_200_000_000), "uptime": 604_800},
                {"type": "lxc", "vmid": 200, "name": "db-container", "node": "pve-node-01",
                 "status": "running", "cpu": 0.03, "maxcpu": 2, "mem": 1_073_741_824,
                 "maxmem": 2_147_483_648, "disk": 12_000_000_000, "maxdisk": 32_212_254_720,
                 "diskread": _mock_counter(900_000, 300_000_000),
                 "diskwrite": _mock_counter(3_400_000, 780_000_000),
                 "netin": _mock_counter(400_000, 1_200_000_000),
                 "netout": _mock_counter(250_000, 900_000_000), "uptime": 604_800},
                {"type": "qemu", "vmid": 301, "name": "siem-collector", "node": "pve-node-02",
                 "status": "stopped", "cpu": 0, "maxcpu": 2, "mem": 0,
                 "maxmem": 8_589_934_592, "disk": 0, "maxdisk": 107_374_182_400,
                 "diskread": 0, "diskwrite": 0, "netin": 0, "netout": 0, "uptime": 0},
                {"type": "storage", "storage": "local", "node": "pve-node-01", "status": "available",
                 "disk": 41_000_000_000, "maxdisk": 107_374_182_400, "plugintype": "dir", "shared": 0},
                {"type": "storage", "storage": "local-lvm", "node": "pve-node-01", "status": "available",
                 "disk": 111_000_000_000, "maxdisk": 214_748_364_800, "plugintype": "lvmthin", "shared": 0},
                {"type": "storage", "storage": "nas-backup", "node": "pve-node-02", "status": "available",
                 "disk": 1_850_000_000_000, "maxdisk": 2_000_000_000_000, "plugintype": "nfs", "shared": 1},
            ]
        if not self._api():
            return []
        # Cache 3s: job poll (5s) va cac request REST dong thoi dung chung 1 lan goi
        return self._cached("cluster:resources", 3,
                            lambda: self._api().cluster.resources.get(), [])

    def get_node_status(self, node_name: str) -> Dict[str, Any]:
        """/nodes/{node}/status — uptime, loadavg, memory, swap, rootfs, cpuinfo."""
        if settings.MOCK_PROXMOX:
            return {
                "uptime": 1_209_600,
                "loadavg": ["1.24", "1.10", "0.98"],
                "cpu": 0.14,
                "cpuinfo": {"cpus": 16, "model": "Intel(R) Xeon(R) E-2288G"},
                "memory": {"total": 34_359_738_368, "used": 12_884_901_888, "free": 21_474_836_480},
                "swap": {"total": 8_589_934_592, "used": 268_435_456, "free": 8_321_499_136},
                "rootfs": {"total": 214_748_364_800, "used": 152_000_000_000, "avail": 62_748_364_800},
                "pveversion": "pve-manager/8.2.4",
                "kversion": "Linux 6.8.12-1-pve",
            }
        if not self._api():
            return {}
        return self._cached(f"status:{node_name}", 4,
                            lambda: self._api().nodes(node_name).status.get(), {})

    def get_storages(self, node_name: str) -> List[Dict[str, Any]]:
        if settings.MOCK_PROXMOX:
            return [
                {"storage": "local", "type": "dir", "active": 1, "enabled": 1,
                 "total": 107_374_182_400, "used": 41_000_000_000, "avail": 66_374_182_400,
                 "content": "iso,vztmpl,backup"},
                {"storage": "local-lvm", "type": "lvmthin", "active": 1, "enabled": 1,
                 "total": 214_748_364_800, "used": 111_000_000_000, "avail": 103_748_364_800,
                 "content": "images,rootdir"},
            ]
        return self._cached(
            f"storages:{node_name}", 30,
            lambda: self._api().nodes(node_name).storage.get(),
            [],
        )

    def get_tasks(self, node_name: str, limit: int = 30) -> List[Dict[str, Any]]:
        if settings.MOCK_PROXMOX:
            now = int(time.time())
            return [
                {"upid": "UPID:mock:1", "type": "vzdump", "status": "OK", "id": "100",
                 "user": "root@pam", "starttime": now - 7200, "endtime": now - 6900},
                {"upid": "UPID:mock:2", "type": "qmstart", "status": "OK", "id": "100",
                 "user": "aegis@pve", "starttime": now - 3600, "endtime": now - 3595},
            ]
        return self._cached(
            f"tasks:{node_name}:{limit}", 20,
            lambda: self._api().nodes(node_name).tasks.get(limit=limit, source="all"),
            [],
        )

    def get_replication(self, node_name: str) -> List[Dict[str, Any]]:
        if settings.MOCK_PROXMOX:
            return []
        return self._cached(
            f"replication:{node_name}", 60,
            lambda: self._api().nodes(node_name).replication.get(),
            [],
        )

    def get_apt_updates(self, node_name: str) -> List[Dict[str, Any]]:
        if settings.MOCK_PROXMOX:
            return [{"Package": "pve-manager", "Version": "8.2.5"}]
        return self._cached(
            f"apt:{node_name}", 900,
            lambda: self._api().nodes(node_name).apt.update.get(),
            [],
        )

    def get_certificates(self, node_name: str) -> List[Dict[str, Any]]:
        if settings.MOCK_PROXMOX:
            return [{"filename": "pveproxy-ssl.pem", "subject": "CN=pve-node-01",
                     "notafter": int(time.time()) + 86400 * 240}]
        return self._cached(
            f"certs:{node_name}", 3600,
            lambda: self._api().nodes(node_name).certificates.info.get(),
            [],
        )

    def get_services(self, node_name: str) -> List[Dict[str, Any]]:
        if settings.MOCK_PROXMOX:
            return [
                {"name": "pveproxy", "state": "running", "desc": "PVE API Proxy Server"},
                {"name": "pve-firewall", "state": "running", "desc": "Proxmox VE firewall"},
                {"name": "sshd", "state": "running", "desc": "OpenBSD Secure Shell server"},
            ]
        return self._cached(
            f"services:{node_name}", 60,
            lambda: self._api().nodes(node_name).services.get(),
            [],
        )

    def get_cluster_status(self) -> List[Dict[str, Any]]:
        if settings.MOCK_PROXMOX:
            return [{"type": "cluster", "name": "aegis-cluster", "quorate": 1, "nodes": 2}]
        return self._cached(
            "cluster:status", 30,
            lambda: self._api().cluster.status.get(),
            [],
        )

    def get_backup_jobs(self) -> List[Dict[str, Any]]:
        if settings.MOCK_PROXMOX:
            return [{"id": "backup-mock", "enabled": 1, "schedule": "sat 02:00", "storage": "local"}]
        return self._cached(
            "cluster:backup", 300,
            lambda: self._api().cluster.backup.get(),
            [],
        )


proxmox_service = ProxmoxService()
