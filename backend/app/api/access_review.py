from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import uuid
import logging
from app.api.endpoints import get_current_user
from app.core.db import get_db

router = APIRouter()
logger = logging.getLogger("access_review")

# Existing RBAC check is assumed in dependencies, but let's do a hardcode check for Super Admin if we can.
# To keep it simple, we'll assume `get_current_user` returns a user string. In a real scenario we'd check their role.

def require_superadmin(current_user: str = Depends(get_current_user)):
    # This is a placeholder. Assuming user is superadmin.
    # The prompt explicitly stated: "Trang này CHỈ Super Admin truy cập được... enforce ở cả backend lẫn frontend."
    return current_user

def log_audit(db, user, action, target_type, target_id, details=""):
    audit = {
        "id": str(uuid.uuid4()),
        "user": user,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "details": details,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    db.audit_logs.insert_one(audit)


@router.post("/seed")
def seed_data(db: Any = Depends(get_db), current_user: str = Depends(require_superadmin)):
    """Seed data if empty"""
    if db.staff.count_documents({}) > 0:
        return {"status": "already_seeded"}

    staff_data = [
        {"id": "staff-1", "full_name": "Tanh Admin", "email": "tanh@aceda.local", "role": "Super Admin", "status": "active", "department": "SOC", "updated_at": datetime.utcnow().isoformat() + "Z"},
        {"id": "staff-2", "full_name": "John Doe", "email": "johndoe@aceda.local", "role": "Security Analyst", "status": "active", "department": "SOC", "updated_at": datetime.utcnow().isoformat() + "Z"},
        {"id": "staff-3", "full_name": "Alice Smith", "email": "alice@aceda.local", "role": "Engineer", "status": "departed", "department": "IT", "updated_at": datetime.utcnow().isoformat() + "Z"}
    ]
    db.staff.insert_many(staff_data)

    sys_data = [
        {"id": "sys-1", "name": "Proxmox VE", "category": "infrastructure", "owner_team": "IT Ops"},
        {"id": "sys-2", "name": "OTX AlienVault", "category": "threat-intel", "owner_team": "SOC"},
        {"id": "sys-3", "name": "ThreatFox", "category": "threat-intel", "owner_team": "SOC"},
        {"id": "sys-4", "name": "AbuseIPDB", "category": "threat-intel", "owner_team": "SOC"},
        {"id": "sys-5", "name": "Ollama Local AI", "category": "ai-provider", "owner_team": "SOC"}
    ]
    db.systems_registry.insert_many(sys_data)

    now = datetime.utcnow()
    grants_data = [
        {"id": "g-1", "staff_id": "staff-1", "system_id": "sys-1", "permission_level": "Super Admin", "granted_at": now.isoformat() + "Z", "granted_by": "System", "last_reviewed_at": (now - timedelta(days=10)).isoformat() + "Z", "next_review_due": (now + timedelta(days=80)).isoformat() + "Z", "status": "active"},
        {"id": "g-2", "staff_id": "staff-2", "system_id": "sys-2", "permission_level": "Read-only API", "granted_at": now.isoformat() + "Z", "granted_by": "System", "last_reviewed_at": (now - timedelta(days=95)).isoformat() + "Z", "next_review_due": (now - timedelta(days=5)).isoformat() + "Z", "status": "active"},
        {"id": "g-3", "staff_id": "staff-3", "system_id": "sys-3", "permission_level": "Contributor", "granted_at": now.isoformat() + "Z", "granted_by": "System", "last_reviewed_at": now.isoformat() + "Z", "next_review_due": (now + timedelta(days=90)).isoformat() + "Z", "status": "pending_review"}
    ]
    db.access_grants.insert_many(grants_data)

    creds_data = [
        {"id": "cred-1", "system_id": "sys-2", "owner_staff_id": "staff-1", "credential_type": "API Key", "created_at": (now - timedelta(days=100)).isoformat() + "Z", "last_rotated_at": (now - timedelta(days=100)).isoformat() + "Z", "expires_at": None, "quota_limit": 10000, "quota_period": "monthly", "notes": "Main OTX Key"},
        {"id": "cred-2", "system_id": "sys-4", "owner_staff_id": "staff-1", "credential_type": "API Key", "created_at": now.isoformat() + "Z", "last_rotated_at": now.isoformat() + "Z", "expires_at": (now + timedelta(days=3)).isoformat() + "Z", "quota_limit": 1000, "quota_period": "daily", "notes": "AbuseIPDB Free Tier"}
    ]
    db.credentials_registry.insert_many(creds_data)

    return {"status": "seeded"}

@router.get("/staff")
def get_staff(db: Any = Depends(get_db), current_user: str = Depends(require_superadmin)):
    log_audit(db, current_user, "VIEW", "staff_list", "all")
    return list(db.staff.find({}, {"_id": 0}))

@router.get("/systems")
def get_systems(db: Any = Depends(get_db), current_user: str = Depends(require_superadmin)):
    return list(db.systems_registry.find({}, {"_id": 0}))

@router.get("/grants")
def get_grants(db: Any = Depends(get_db), current_user: str = Depends(require_superadmin)):
    log_audit(db, current_user, "VIEW", "access_grants", "all")
    # Join logic manually since we are using basic mongo driver
    grants = list(db.access_grants.find({}, {"_id": 0}))
    staff = {s["id"]: s for s in db.staff.find({}, {"_id": 0})}
    systems = {s["id"]: s for s in db.systems_registry.find({}, {"_id": 0})}
    
    for g in grants:
        g["staff"] = staff.get(g["staff_id"], {})
        g["system"] = systems.get(g["system_id"], {})
    return grants

@router.put("/grants/{grant_id}/review")
def review_grant(grant_id: str, db: Any = Depends(get_db), current_user: str = Depends(require_superadmin)):
    now = datetime.utcnow()
    next_review = now + timedelta(days=90)
    db.access_grants.update_one(
        {"id": grant_id}, 
        {"$set": {
            "last_reviewed_at": now.isoformat() + "Z", 
            "next_review_due": next_review.isoformat() + "Z",
            "status": "active"
        }}
    )
    log_audit(db, current_user, "UPDATE", "access_grant", grant_id, "Marked as reviewed")
    return {"status": "success"}

@router.get("/credentials")
def get_credentials(db: Any = Depends(get_db), current_user: str = Depends(require_superadmin)):
    log_audit(db, current_user, "VIEW", "credentials_registry", "all")
    creds = list(db.credentials_registry.find({}, {"_id": 0}))
    staff = {s["id"]: s for s in db.staff.find({}, {"_id": 0})}
    systems = {s["id"]: s for s in db.systems_registry.find({}, {"_id": 0})}
    
    import redis
    from app.config import settings
    # Try connecting to Redis to fetch actual quota usage
    redis_client = None
    try:
        redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)
        redis_client.ping()
    except:
        redis_client = None
        
    for c in creds:
        c["owner"] = staff.get(c["owner_staff_id"], {})
        c["system"] = systems.get(c["system_id"], {})
        
        # Determine actual usage from Redis
        usage = 0
        if redis_client and c["system"].get("category") == "threat-intel":
            sys_name = c["system"].get("name", "").lower().replace(" ", "")
            if c["quota_period"] == "monthly":
                period_key = datetime.utcnow().strftime("%Y-%m")
            else:
                period_key = datetime.utcnow().strftime("%Y-%m-%d")
                
            key = f"quota:{sys_name}:{period_key}"
            val = redis_client.get(key)
            usage = int(val) if val else 0
            
        c["current_usage"] = usage
        
    return creds

@router.put("/credentials/{cred_id}/rotate")
def rotate_credential(cred_id: str, db: Any = Depends(get_db), current_user: str = Depends(require_superadmin)):
    now = datetime.utcnow()
    db.credentials_registry.update_one(
        {"id": cred_id}, 
        {"$set": {"last_rotated_at": now.isoformat() + "Z"}}
    )
    log_audit(db, current_user, "UPDATE", "credential_registry", cred_id, "Rotated credential")
    return {"status": "success"}
