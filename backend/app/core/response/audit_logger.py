import logging
from app.core.db import SessionLocal
from app.models.incident import AuditLog
import json
from datetime import datetime

logger = logging.getLogger(__name__)

class AuditLogger:
    def log(self, actor: str, action: str, target: str, details: dict):
        db = SessionLocal()
        try:
            audit = AuditLog(
                actor=actor,
                action=action,
                target=target,
                details=json.dumps(details)
            )
            db.add(audit)
            db.commit()
            logger.info(f"AUDIT LOG: [{actor}] {action} on {target}")
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")
            db.rollback()
        finally:
            db.close()

audit_logger = AuditLogger()
