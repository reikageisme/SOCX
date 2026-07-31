import logging
from datetime import datetime, timedelta
from app.core.mongodb import mongodb_storage
from app.services.discord import discord_service

logger = logging.getLogger("access_review_jobs")

async def check_access_reviews():
    """Scheduled job to check for overdue access reviews and credential rotations."""
    if not mongodb_storage.db:
        return

    db = mongodb_storage.db
    now = datetime.utcnow()
    
    # 1. Check access grants due for review
    due_grants = list(db.access_grants.find({
        "status": "active",
        "next_review_due": {"$lte": now.isoformat() + "Z"}
    }))
    
    if due_grants:
        logger.warning(f"Found {len(due_grants)} access grants due for review.")
        db.access_grants.update_many(
            {"id": {"$in": [g["id"] for g in due_grants]}},
            {"$set": {"status": "pending_review"}}
        )
        discord_service.send_alert(
            category="critical-alerts",
            content="🔐 **Access Review Required**",
            embeds=[{
                "title": "Access Review Overdue",
                "description": f"Found **{len(due_grants)}** permissions that need re-certification by a Super Admin.",
                "color": 15158332
            }]
        )

    # 2. Check credentials needing rotation (>90 days)
    ninety_days_ago = now - timedelta(days=90)
    old_creds = list(db.credentials_registry.find({
        "last_rotated_at": {"$lte": ninety_days_ago.isoformat() + "Z"}
    }))
    
    if old_creds:
        logger.warning(f"Found {len(old_creds)} credentials overdue for rotation.")
        discord_service.send_alert(
            category="security-warnings",
            content="🔑 **Credential Rotation Warning**",
            embeds=[{
                "title": "Stale Credentials Detected",
                "description": f"Found **{len(old_creds)}** API keys/credentials older than 90 days. Please rotate them immediately.",
                "color": 15158332
            }]
        )

    # 3. Check credentials expiring in < 7 days
    in_seven_days = now + timedelta(days=7)
    expiring_creds = list(db.credentials_registry.find({
        "expires_at": {"$lte": in_seven_days.isoformat() + "Z", "$ne": None}
    }))
    
    if expiring_creds:
        logger.warning(f"Found {len(expiring_creds)} credentials expiring soon.")
        discord_service.send_alert(
            category="critical-alerts",
            content="⚠️ **Credential Expiration Alert**",
            embeds=[{
                "title": "Credentials Expiring Soon",
                "description": f"Found **{len(expiring_creds)}** API keys/credentials expiring within 7 days. Action required to prevent service disruption.",
                "color": 15105570
            }]
        )
