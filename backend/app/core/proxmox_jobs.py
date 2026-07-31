import json
import logging
from datetime import datetime
import uuid
from app.services.proxmox import proxmox_service
from app.api.ws_proxmox import manager
from app.core.mongodb import mongodb_storage
from app.config import settings

logger = logging.getLogger("proxmox_jobs")

async def poll_proxmox_and_broadcast():
    try:
        import redis
        redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)
        redis_client.ping()
    except Exception:
        redis_client = None

    try:
        nodes = proxmox_service.get_nodes()
        if not nodes:
            return

        all_vms = {}
        alerts = []

        for node in nodes:
            node_name = node.get("node")
            
            # Check Thresholds for node
            cpu_usage = node.get("cpu", 0)
            max_mem = node.get("maxmem", 1)
            mem_usage = node.get("mem", 0) / max_mem if max_mem > 0 else 0
            
            if cpu_usage > 0.9:
                alerts.append({"node": node_name, "type": "CPU", "value": cpu_usage})
            if mem_usage > 0.9:
                alerts.append({"node": node_name, "type": "Memory", "value": mem_usage})

            try:
                vms = proxmox_service.get_vms(node_name)
                lxcs = proxmox_service.get_lxc(node_name)
                
                # QEMU VMs
                for vm in vms:
                    all_vms[str(vm.get("vmid"))] = {
                        "vmid": vm.get("vmid"),
                        "name": vm.get("name"),
                        "status": vm.get("status"),
                        "type": "qemu",
                        "node": node_name,
                        "cpu": vm.get("cpu", 0),
                        "mem": vm.get("mem", 0),
                        "maxmem": vm.get("maxmem", 1)
                    }
                
                # LXC Containers
                for lxc in lxcs:
                    all_vms[str(lxc.get("vmid"))] = {
                        "vmid": lxc.get("vmid"),
                        "name": lxc.get("name"),
                        "status": lxc.get("status"),
                        "type": "lxc",
                        "node": node_name,
                        "cpu": lxc.get("cpu", 0),
                        "mem": lxc.get("mem", 0),
                        "maxmem": lxc.get("maxmem", 1)
                    }
            except Exception as e:
                logger.error(f"Error fetching VMs for node {node_name}: {e}")

        payload = {
            "nodes": nodes,
            "vms": list(all_vms.values())
        }
        
        payload_json = json.dumps(payload)
        
        should_broadcast = True
        if redis_client:
            last_payload = redis_client.get("proxmox_last_payload")
            if last_payload == payload_json:
                should_broadcast = False
            else:
                redis_client.set("proxmox_last_payload", payload_json, ex=60)
        
        if should_broadcast:
            await manager.broadcast(payload)

        # Process alerts
        db = mongodb_storage.get_db()
        if db is not None:
            now = datetime.utcnow()
            for alert in alerts:
                alert_id = f"alert-{alert['node']}-{alert['type']}"
                # Simple debounce: check if a similar incident was created recently
                recent = db.incidents.find_one({
                    "title": {"$regex": f"High {alert['type']} on node {alert['node']}"},
                    "status": {"$ne": "resolved"}
                })
                
                if not recent:
                    inc = {
                        "id": str(uuid.uuid4()),
                        "title": f"High {alert['type']} on node {alert['node']}: {int(alert['value']*100)}%",
                        "severity": "medium",
                        "status": "open",
                        "created_at": now.isoformat() + "Z",
                        "updated_at": now.isoformat() + "Z",
                        "description": f"Automated alert: {alert['type']} usage exceeded 90% threshold.",
                        "tags": ["infrastructure", "automated"]
                    }
                    db.incidents.insert_one(inc)

    except Exception as e:
        logger.error(f"Error in poll_proxmox_and_broadcast: {e}")
