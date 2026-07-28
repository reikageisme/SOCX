import logging
import time
from typing import Dict, Any, List
from datetime import datetime
from app.core.detection.rule_manager import rule_manager
from app.models.incident import Incident
from app.core.db import SessionLocal
import json
import uuid

logger = logging.getLogger(__name__)

class DetectionEngine:
    def __init__(self):
        # Format: { "source_ip:rule_name": {"count": 1, "first_seen": timestamp} }
        self.state: Dict[str, Dict[str, Any]] = {}
        self.window_seconds = 300 # 5 minutes

    def evaluate_event(self, event: Dict[str, Any], dry_run: bool = False) -> bool:
        rules = rule_manager.get_rules()
        source_ip = event.get("source", {}).get("query") or event.get("source", {}).get("country") or "unknown_ip"
        
        # Simple extraction from raw pipeline event
        if "saddr" in event.get("metadata", {}):
            source_ip = event["metadata"]["saddr"]

        triggered = False
        for rule in rules:
            if self._matches_selection(event, rule.get("selection", {})):
                if self._correlate(source_ip, rule, event, dry_run=dry_run):
                    triggered = True
        return triggered

    def _matches_selection(self, event: Dict[str, Any], selection: Dict[str, Any]) -> bool:
        # Simple matching logic
        # For example, selection: { type: malicious_ip, dest_port: 22 }
        for k, v in selection.items():
            # Check root level
            if event.get(k) == v:
                continue
            # Check metadata level (e.g. dest_port in metadata.dport)
            metadata = event.get("metadata", {})
            if k == "dest_port" and metadata.get("dport") == v:
                continue
                
            return False
        return True

    def _correlate(self, source_ip: str, rule: Dict[str, Any], event: Dict[str, Any], dry_run: bool = False) -> bool:
        rule_name = rule.get("name", "Unknown Rule")
        key = f"{source_ip}:{rule_name}"
        now = time.time()

        if key not in self.state:
            self.state[key] = {"count": 1, "first_seen": now, "events": [event]}
        else:
            # Check window expiry
            if now - self.state[key]["first_seen"] > self.window_seconds:
                # Reset window
                self.state[key] = {"count": 1, "first_seen": now, "events": [event]}
            else:
                self.state[key]["count"] += 1
                self.state[key]["events"].append(event)

        # Evaluate condition (e.g., count > 5)
        # Parse "count > 5" simply
        condition = rule.get("condition", "")
        threshold = 1
        if "count >" in condition:
            try:
                threshold = int(condition.split("count >")[1].split(" ")[1])
            except:
                pass

        if self.state[key]["count"] >= threshold:
            # Check if we already created an incident recently to avoid spam
            if not self.state[key].get("incident_created"):
                if not dry_run:
                    self._create_incident(source_ip, rule, self.state[key]["events"])
                self.state[key]["incident_created"] = True
            return True
        return False

    def _create_incident(self, source_ip: str, rule: Dict[str, Any], events: List[Dict[str, Any]]):
        logger.warning(f"🚨 INCIDENT TRIGGERED: {rule['name']} from {source_ip}")
        db = SessionLocal()
        try:
            incident = Incident(
                id=str(uuid.uuid4()),
                title=rule["name"],
                severity=rule.get("severity", "medium"),
                source_ip=source_ip,
                event_count=len(events),
                mitre_tactics=json.dumps([rule.get("mitre", {}).get("tactic", "")]),
                mitre_techniques=json.dumps([rule.get("mitre", {}).get("technique", "")]),
                related_events=json.dumps([e.get("timestamp") for e in events])
            )
            db.add(incident)
            db.commit()
            db.refresh(incident)
            # Trigger Response Playbook
            from app.core.response.executor import playbook_executor
            playbook_executor.execute_for_incident(incident, db)
            
            # BROADCAST NOTIFICATION TO WEBSOCKET
            try:
                from app.core.websockets import manager
                import asyncio
                import json
                
                notif_msg = {
                    "type": "notification",
                    "data": {
                        "id": incident.id,
                        "title": f"New Incident: {incident.title}",
                        "severity": incident.severity,
                        "timestamp": incident.created_at.isoformat() + "Z" if hasattr(incident, 'created_at') and incident.created_at else __import__('datetime').datetime.utcnow().isoformat() + "Z"
                    }
                }
                
                # Check if we are running in an active event loop
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(manager.broadcast(json.dumps(notif_msg)))
                except RuntimeError:
                    pass # Not in an async context, can't easily broadcast here without a loop
            except Exception as wse:
                logger.error(f"Failed to broadcast notification: {wse}")
            
        except Exception as e:
            logger.error(f"Failed to create incident: {e}")
            db.rollback()
        finally:
            db.close()

detection_engine = DetectionEngine()
