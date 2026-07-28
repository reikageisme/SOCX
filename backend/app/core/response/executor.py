import logging
from app.models.incident import Incident, ActionRequest
from app.core.response.playbook_manager import playbook_manager
from app.core.response.audit_logger import audit_logger
from app.core.db import SessionLocal
from sqlalchemy.orm import Session
import uuid
import json

logger = logging.getLogger(__name__)

class PlaybookExecutor:
    def execute_for_incident(self, incident: Incident, db: Session = None):
        playbooks = playbook_manager.get_playbooks()
        close_db_here = False
        if not db:
            db = SessionLocal()
            close_db_here = True
        
        for pb in playbooks:
            trigger = pb.get("trigger", {})
            
            # Simple match
            if trigger.get("incident_name") == incident.title:
                self._trigger_playbook(pb, incident, db)

        if close_db_here:
            db.close()

    def _trigger_playbook(self, playbook: dict, incident: Incident, db: Session):
        logger.info(f"Triggering playbook '{playbook['name']}' for incident {incident.id}")
        audit_logger.log("system", "playbook_triggered", playbook['name'], {"incident_id": incident.id})
        
        try:
            all_auto = True
            for action in playbook.get("actions", []):
                requires_approval = action.get("requires_approval", True)
                
                # Jinja-like template substitution (simplified)
                target = action.get("target", "")
                if target == "{{ incident.source_ip }}":
                    target = incident.source_ip
                elif target == "{{ incident.dest_ip }}":
                    target = incident.dest_ip or "unknown"
                
                req = ActionRequest(
                    id=str(uuid.uuid4()),
                    incident_id=incident.id,
                    action_type=action.get("type", "unknown"),
                    target=target,
                    parameters=json.dumps(action),
                    requires_approval=requires_approval,
                    status="pending" if requires_approval else "executed",
                    executed_by=None if requires_approval else "system"
                )
                db.add(req)
                
                if not requires_approval:
                    self._auto_execute_action(req)
                else:
                    all_auto = False
                    
            if all_auto and len(playbook.get("actions", [])) > 0:
                # OPTION A: Auto-resolve incident if all actions were auto-executed successfully
                incident.status = "resolved"
                incident.timeline_notes = (incident.timeline_notes or "") + f"\n[System] Auto-resolved by Playbook: {playbook['name']} at {__import__('datetime').datetime.utcnow().isoformat()}"
                
            db.commit()
            
            # TODO: Send Alert to Telegram if severity is high
            
        except Exception as e:
            logger.error(f"Playbook execution failed: {e}")
            db.rollback()

    def _auto_execute_action(self, action_req: ActionRequest):
        logger.warning(f"⚡ AUTO EXECUTING ACTION: {action_req.action_type} on {action_req.target}")
        # In a real system, we would call the Proxmox API / iptables here
        audit_logger.log("system", "action_auto_executed", action_req.action_type, {"target": action_req.target, "action_id": action_req.id})

    def approve_action(self, action_id: str, admin_user: str):
        db = SessionLocal()
        try:
            req = db.query(ActionRequest).filter(ActionRequest.id == action_id).first()
            if req and req.status == "pending":
                req.status = "executed"
                req.executed_by = admin_user
                db.commit()
                logger.warning(f"🛡️ ADMIN APPROVED ACTION: {req.action_type} on {req.target}")
                audit_logger.log(admin_user, "action_approved", req.action_type, {"target": req.target, "action_id": req.id})
                return True
        finally:
            db.close()
        return False

    def reject_action(self, action_id: str, admin_user: str):
        db = SessionLocal()
        try:
            req = db.query(ActionRequest).filter(ActionRequest.id == action_id).first()
            if req and req.status == "pending":
                req.status = "rejected"
                req.executed_by = admin_user
                db.commit()
                logger.warning(f"❌ ADMIN REJECTED ACTION: {req.action_type} on {req.target}")
                audit_logger.log(admin_user, "action_rejected", req.action_type, {"target": req.target, "action_id": req.id})
                return True
        finally:
            db.close()
        return False

playbook_executor = PlaybookExecutor()
