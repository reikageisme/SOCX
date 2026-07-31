from fastapi import APIRouter, Depends
from app.api.endpoints import get_current_user
from app.services.proxmox import proxmox_service
import subprocess
import json
import redis

router = APIRouter()

def get_tailscale_status():
    try:
        # Check if tailscale is installed and get status
        result = subprocess.run(["tailscale", "status", "--json"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            ts_data = json.loads(result.stdout)
            peers = []
            for peer_id, peer_data in ts_data.get("Peer", {}).items():
                peers.append({
                    "id": f"ts-{peer_id}",
                    "hostname": peer_data.get("HostName"),
                    "ip": peer_data.get("TailscaleIPs", [""])[0] if peer_data.get("TailscaleIPs") else "",
                    "os": peer_data.get("OS"),
                    "is_online": peer_data.get("Online")
                })
            return {"active": True, "peers": peers, "self": ts_data.get("Self", {}).get("HostName")}
    except Exception:
        pass
    return {"active": False, "peers": []}

@router.get("")
def get_topology(current_user: str = Depends(get_current_user)):
    """
    Returns a layer-based network topology: wan, lan, overlay, hypervisor, vm
    """
    nodes = []
    edges = []

    # Layer: WAN
    nodes.append({
        "id": "wan",
        "label": "Internet / WAN",
        "type": "internet",
        "layer": "wan"
    })
    nodes.append({
        "id": "cloudflare",
        "label": "Cloudflare WAF / CDN",
        "type": "waf",
        "layer": "wan"
    })

    # Layer: LAN
    nodes.append({
        "id": "firewall",
        "label": "ACS Firewall",
        "type": "firewall",
        "layer": "lan"
    })
    
    # WAN -> Cloudflare -> Firewall
    edges.append({"source": "wan", "target": "cloudflare", "type": "uplink"})
    edges.append({"source": "cloudflare", "target": "firewall", "type": "uplink"})

    # Try to load from Redis cache first for faster response
    cached_payload = None
    try:
        redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)
        cached_data = redis_client.get("proxmox_last_payload")
        if cached_data:
            cached_payload = json.loads(cached_data)
    except Exception:
        pass

    # Layer: Hypervisor & VM
    if cached_payload:
        pve_nodes = cached_payload.get("nodes", [])
        vms = cached_payload.get("vms", [])
        
        for pve in pve_nodes:
            node_id = f"pve-{pve['node']}"
            nodes.append({
                "id": node_id,
                "label": pve['node'],
                "type": "proxmox",
                "status": pve['status'],
                "cpu": pve.get('cpu', 0),
                "layer": "hypervisor"
            })
            edges.append({"source": "firewall", "target": node_id, "type": "lan_link"})
            
            for vm in vms:
                if vm.get("node") == pve['node']:
                    vm_id = f"vm-{pve['node']}-{vm['vmid']}"
                    nodes.append({
                        "id": vm_id,
                        "label": vm['name'],
                        "type": "vm",
                        "status": vm['status'],
                        "layer": "vm"
                    })
                    edges.append({"source": node_id, "target": vm_id, "type": "virtual_link"})
    else:
        pve_nodes = proxmox_service.get_nodes()
        for pve in pve_nodes:
            node_id = f"pve-{pve['node']}"
            nodes.append({
                "id": node_id,
                "label": pve['node'],
                "type": "proxmox",
                "status": pve['status'],
                "cpu": pve.get('cpu', 0),
                "layer": "hypervisor"
            })
            edges.append({"source": "firewall", "target": node_id, "type": "lan_link"})

            vms_list = proxmox_service.get_vms(pve['node'])
            lxcs = proxmox_service.get_lxc(pve['node'])
            
            for vm in (vms_list + lxcs):
                vm_id = f"vm-{pve['node']}-{vm['vmid']}"
                nodes.append({
                    "id": vm_id,
                    "label": vm['name'],
                    "type": "vm",
                    "status": vm['status'],
                    "layer": "vm"
                })
                edges.append({"source": node_id, "target": vm_id, "type": "virtual_link"})

    # Layer: Overlay (Tailscale)
    ts_status = get_tailscale_status()
    if ts_status["active"]:
        nodes.append({
            "id": "tailscale_router",
            "label": "Tailscale Overlay",
            "type": "overlay_router",
            "layer": "overlay"
        })
        edges.append({"source": "wan", "target": "tailscale_router", "type": "overlay_uplink"})
        
        for peer in ts_status["peers"]:
            peer_id = peer["id"]
            nodes.append({
                "id": peer_id,
                "label": f"{peer['hostname']} ({peer['os']})",
                "type": "ts_peer",
                "status": "running" if peer["is_online"] else "offline",
                "layer": "overlay"
            })
            edges.append({"source": "tailscale_router", "target": peer_id, "type": "overlay_tunnel"})

    return {"status": "success", "data": {"nodes": nodes, "edges": edges, "tailscale_active": ts_status["active"]}}
