from proxmoxer import ProxmoxAPI
from app.config import settings

class ProxmoxService:
    def __init__(self):
        self.proxmox = None
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

    def get_nodes(self):
        if settings.MOCK_PROXMOX:
            return [{"node": "pve-node-01", "status": "online", "cpu": 0.12, "mem": 4294967296}, 
                    {"node": "pve-node-02", "status": "offline", "cpu": 0.0, "mem": 0}]
        if not self.proxmox:
            self._connect()
            if not self.proxmox:
                return []
        try:
            return self.proxmox.nodes.get()
        except Exception as e:
            print(f"Error fetching nodes: {str(e)}")
            return []

    def get_vms(self, node_name: str):
        if settings.MOCK_PROXMOX:
            return [{"vmid": 100, "name": "web-server", "status": "running"}]
        if not self.proxmox:
            self._connect()
            if not self.proxmox:
                return []
        try:
            return self.proxmox.nodes(node_name).qemu.get()
        except Exception as e:
            print(f"Error fetching VMs for node {node_name}: {str(e)}")
            return []

    def get_lxc(self, node_name: str):
        if settings.MOCK_PROXMOX:
            return [{"vmid": 200, "name": "db-container", "status": "running"}]
        if not self.proxmox:
            self._connect()
            if not self.proxmox:
                return []
        try:
            return self.proxmox.nodes(node_name).lxc.get()
        except Exception as e:
            print(f"Error fetching LXC for node {node_name}: {str(e)}")
            return []

    def execute_vm_action(self, node_name: str, vmid: int, action: str):
        if settings.MOCK_PROXMOX:
            return {"status": "mock_success", "action": action, "vmid": vmid}
        if not self.proxmox:
            self._connect()
            if not self.proxmox:
                raise Exception("Not connected to Proxmox")
                
        # Proxmox API allows start, stop, shutdown, reboot, suspend, resume
        # Path: /nodes/{node}/qemu/{vmid}/status/{action} or lxc/{vmid}
        try:
            # Try QEMU first, if fails try LXC
            try:
                res = self.proxmox.nodes(node_name).qemu(vmid).status.post(action)
            except:
                res = self.proxmox.nodes(node_name).lxc(vmid).status.post(action)
            return res
        except Exception as e:
            raise Exception(f"Failed to execute {action} on VM {vmid}: {str(e)}")

proxmox_service = ProxmoxService()
