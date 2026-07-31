import logging
from app.core.mongodb import mongodb_storage
import json
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)

class AuditLogger:
    def log(self, actor: str, action: str, target: str, details: dict):
        db = mongodb_storage.db
        if db is None:
            logger.error("MongoDB not initialized, cannot write audit log")
            return
            
        try:
            audit = {
                "id": str(uuid.uuid4()),
                "actor": actor,
                "action": action,
                "target": target,
                "details": json.dumps(details),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
            db.audit_logs.insert_one(audit)
            logger.info(f"AUDIT LOG: [{actor}] {action} on {target}")
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")

audit_logger = AuditLogger()
