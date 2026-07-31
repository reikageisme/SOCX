import logging
from app.core.response.playbook_manager import playbook_manager
from app.core.response.audit_logger import audit_logger
from app.core.mongodb import mongodb_storage
from typing import Dict, Any
import uuid
import json

logger = logging.getLogger(__name__)

class PlaybookExecutor:
    def execute_for_incident(self, incident: Dict[str, Any], db: Any = None):
        playbooks = playbook_manager.get_playbooks()
        if not db:
            db = mongodb_storage.db
        
        for pb in playbooks:
            trigger = pb.get("trigger", {})
            
            # Simple match
            if trigger.get("incident_name") == incident.get("title"):
                self._trigger_playbook(pb, incident, db)

    def _trigger_playbook(self, playbook: dict, incident: Dict[str, Any], db: Any):
        logger.info(f"Triggering playbook '{playbook['name']}' for incident {incident.get('id')}")
        audit_logger.log("system", "playbook_triggered", playbook['name'], {"incident_id": incident.get('id')})
        
        try:
            all_auto = True
            for action in playbook.get("actions", []):
                requires_approval = action.get("requires_approval", True)
                
                # Jinja-like template substitution (simplified)
                target = action.get("target", "")
                if target == "{{ incident.source_ip }}":
                    target = incident.get("source_ip")
                elif target == "{{ incident.dest_ip }}":
                    target = incident.get("dest_ip") or "unknown"
                
                req = {
                    "id": str(uuid.uuid4()),
                    "incident_id": incident.get("id"),
                    "action_type": action.get("type", "unknown"),
                    "target": target,
                    "parameters": json.dumps(action),
                    "requires_approval": requires_approval,
                    "status": "pending" if requires_approval else "executed",
                    "executed_by": None if requires_approval else "system"
                }
                db.action_requests.insert_one(req)
                
                if not requires_approval:
                    self._auto_execute_action(req)
                else:
                    all_auto = False
                    
            if all_auto and len(playbook.get("actions", [])) > 0:
                incident["status"] = "resolved"
                incident["timeline_notes"] = (incident.get("timeline_notes", "") or "") + f"\n[System] Auto-resolved by Playbook: {playbook['name']} at {__import__('datetime').datetime.utcnow().isoformat()}"
                db.incidents.update_one({"id": incident.get("id")}, {"$set": {"status": "resolved", "timeline_notes": incident["timeline_notes"]}})
            
            # TODO: Send Alert to Telegram if severity is high
            
        except Exception as e:
            logger.error(f"Playbook execution failed: {e}")

    def _auto_execute_action(self, action_req: Dict[str, Any]):
        logger.warning(f"⚡ AUTO EXECUTING ACTION: {action_req.get('action_type')} on {action_req.get('target')}")
        # In a real system, we would call the Proxmox API / iptables here
        audit_logger.log("system", "action_auto_executed", action_req.get("action_type"), {"target": action_req.get("target"), "action_id": action_req.get("id")})

    def approve_action(self, action_id: str, admin_user: str):
        db = mongodb_storage.db
        req = db.action_requests.find_one({"id": action_id})
        if req and req.get("status") == "pending":
            db.action_requests.update_one({"id": action_id}, {"$set": {"status": "executed", "executed_by": admin_user}})
            logger.warning(f"🛡️ ADMIN APPROVED ACTION: {req.get('action_type')} on {req.get('target')}")
            audit_logger.log(admin_user, "action_approved", req.get("action_type"), {"target": req.get("target"), "action_id": req.get("id")})
            return True
        return False

    def reject_action(self, action_id: str, admin_user: str):
        db = mongodb_storage.db
        req = db.action_requests.find_one({"id": action_id})
        if req and req.get("status") == "pending":
            db.action_requests.update_one({"id": action_id}, {"$set": {"status": "rejected", "executed_by": admin_user}})
            logger.warning(f"❌ ADMIN REJECTED ACTION: {req.get('action_type')} on {req.get('target')}")
            audit_logger.log(admin_user, "action_rejected", req.get("action_type"), {"target": req.get("target"), "action_id": req.get("id")})
            return True
        return False

playbook_executor = PlaybookExecutor()
