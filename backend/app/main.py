from fastapi import FastAPI, Depends
from app.api.endpoints import get_current_user
from fastapi import WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.endpoints import router as api_router
from app.api.auth import router as auth_router
from app.api.assets import router as assets_router
from app.api.system import router as system_router
from app.api.hunt import router as hunt_router
from app.api.analytics import router as analytics_router
from app.core.websockets import manager
from app.core.security import verify_token
import json
import asyncio
import logging

ws_logger = logging.getLogger("websocket.auth")

app = FastAPI(title=settings.PROJECT_NAME)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ALLOWED_ORIGINS.split(",")],  # Specific origins when credentials are True
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=settings.API_V1_STR, tags=["auth"])
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(assets_router, prefix=f"{settings.API_V1_STR}/assets", tags=["assets"])
app.include_router(system_router, prefix=f"{settings.API_V1_STR}/system", tags=["system"])
app.include_router(hunt_router, prefix=f"{settings.API_V1_STR}/hunt", tags=["hunt"])
app.include_router(analytics_router, prefix=f"{settings.API_V1_STR}/analytics", tags=["analytics"])

@app.websocket("/ws/threat-map")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default=None)):
    # ── Step 1: Verify token BEFORE accepting the connection ──
    username = verify_token(token)
    if username is None:
        ws_logger.warning(
            f"[WS] Rejected connection: invalid/missing token from {websocket.client}"
        )
        await websocket.close(code=4001, reason="Authentication required")
        return

    # ── Step 2: Per-user connection rate limit ──
    if not manager.can_connect(username):
        ws_logger.warning(
            f"[WS] Rejected connection: user '{username}' exceeded max connections"
        )
        await websocket.close(code=4002, reason="Too many connections")
        return

    # ── Step 3: Accept and track ──
    await manager.connect(websocket, username=username)
    ws_logger.info(f"[WS] User '{username}' authenticated and connected")

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal_message(
                    json.dumps({"type": "pong", "message": "Connection active"}),
                    websocket
                )
            else:
                await manager.send_personal_message(
                    f"Message text was: {data}", websocket
                )
    except WebSocketDisconnect as e:
        manager.disconnect(websocket)
        ws_logger.info(
            f"[WS] User '{username}' disconnected. Code: {e.code}, Reason: {e.reason}"
        )
    except Exception as e:
        manager.disconnect(websocket)
        ws_logger.error(f"[WS] User '{username}' error: {e}")

from app.core.geoip import geoip_service
from app.core.threat_intel import threat_intel_service
from app.core.pipeline import pipeline
from app.core.clickhouse import clickhouse_storage
from app.core.db import engine, Base
from app.models.incident import Incident, ActionRequest
from app.core.response.executor import playbook_executor

@app.get("/api/v1/health")
def health_check():
    # Kiểm tra trạng thái DB
    try:
        from app.core.db import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {str(e)}"
        
    last_event = pipeline.last_event_time.isoformat() + "Z" if pipeline.last_event_time else "never"
    last_pull = threat_intel_service.last_pull_time.isoformat() + "Z" if threat_intel_service.last_pull_time else "never"
    
    return {
        "status": "healthy" if db_status == "ok" else "degraded",
        "database": db_status,
        "pipeline": {
            "is_running": pipeline.is_running,
            "last_event_seen": last_event
        },
        "threat_intel": {
            "last_pull_status": threat_intel_service.last_pull_status,
            "last_pull_time": last_pull
        }
    }

@app.get("/api/v1/system/data-sources/status")
def get_data_sources_status(current_user: str = Depends(get_current_user)):
    last_event = pipeline.last_event_time.isoformat() + "Z" if pipeline.last_event_time else None
    last_pull = threat_intel_service.last_pull_time.isoformat() + "Z" if threat_intel_service.last_pull_time else None
    
    return {
        "local_sensor": {
            "last_event": last_event,
            "status": "active" if pipeline.is_running else "no_data",
            "description": "eBPF agent monitoring local server connections"
        },
        "global_feed": {
            "last_pull": last_pull,
            "status": threat_intel_service.last_pull_status,
            "total_cached_ips": len(threat_intel_service.malicious_ips),
            "description": "OTX + ThreatFox + AbuseIPDB threat intelligence"
        }
    }

from pydantic import BaseModel
import yaml
from app.core.detection.rule_manager import rule_manager

class ValidateRequest(BaseModel):
    yaml_content: str

@app.get("/api/v1/rules")
def get_rules(current_user: str = Depends(get_current_user)):
    return {"rules": rule_manager.get_rules()}

@app.post("/api/v1/rules/validate")
def validate_rule(req: ValidateRequest, current_user: str = Depends(get_current_user)):
    try:
        parsed = yaml.safe_load(req.yaml_content)
        if not parsed.get("name") or not parsed.get("selection"):
            return {"status": "error", "message": "Missing 'name' or 'selection'"}
        return {"status": "success", "parsed": parsed}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/v1/rules/dry-run")
def dry_run_rule(req: ValidateRequest, current_user: str = Depends(get_current_user)):
    try:
        parsed = yaml.safe_load(req.yaml_content)
        # Mock dry-run logic
        mock_events = [
            {"source": {"query": "10.0.0.1"}, "metadata": {"saddr": "10.0.0.1", "dport": 22}, "type": "malicious_ip"}
        ] * 6
        from app.core.detection.engine import DetectionEngine
        engine = DetectionEngine()
        # Override rules with just this one
        rule_manager.rules = [parsed]
        for ev in mock_events:
            engine.evaluate_event(ev, dry_run=True)
        
        # Restore actual rules
        rule_manager.load_local_rules()
        
        # Check if incident was triggered in memory
        triggered = any(v.get("incident_created") for v in engine.state.values())
        return {"status": "success", "triggered": triggered, "events_tested": 6}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/v1/logs")
def get_logs(current_user: str = Depends(get_current_user)):
    from app.core.db import SessionLocal
    from app.models.incident import AuditLog
    db = SessionLocal()
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100).all()
    res = [{"id": l.id, "actor": l.actor, "action": l.action, "target": l.target, "details": l.details, "timestamp": l.timestamp} for l in logs]
    db.close()
    return {"logs": res}

@app.get("/api/v1/settings")
def get_settings(current_user: str = Depends(get_current_user)):
    from app.config import settings
    def mask_key(k):
        if not k: return ""
        if len(k) <= 4: return "****"
        return "*" * 8 + k[-4:]
        
    return {
        "otx_key": mask_key(settings.OTX_API_KEY),
        "threatfox_key": mask_key(settings.THREATFOX_API_KEY),
        "abuseipdb_key": mask_key(settings.ABUSEIPDB_API_KEY),
        "threat_intel_interval": 15,
        "ai_provider": getattr(settings, "AI_PROVIDER", "ollama"),
        "ollama_url": getattr(settings, "OLLAMA_URL", "http://localhost:11434"),
        "gemini_key": mask_key(getattr(settings, "GEMINI_API_KEY", ""))
    }

class IncidentSummaryRequest(BaseModel):
    prompt: str

@app.post("/api/v1/ai/summarize-incident")
async def summarize_incident(req: IncidentSummaryRequest, current_user: str = Depends(get_current_user)):
    try:
        from app.services.ai.provider import AIProviderFactory
        provider_type = getattr(settings, "AI_PROVIDER", "ollama")
        if provider_type == "ollama":
            url = getattr(settings, "OLLAMA_URL", "http://localhost:11434")
            provider = AIProviderFactory.get_provider("ollama", url=url)
        else:
            api_key = getattr(settings, "GEMINI_API_KEY", "")
            provider = AIProviderFactory.get_provider("gemini", api_key=api_key)
            
        summary = await provider.generate_summary(req.prompt)
        return {"status": "success", "summary": summary}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Setup API cho SOAR-lite
@app.get("/api/v1/incidents")
def get_incidents(current_user: str = Depends(get_current_user)):
    from app.core.db import SessionLocal
    db = SessionLocal()
    incidents = db.query(Incident).order_by(Incident.created_at.desc()).limit(50).all()
    res = []
    for i in incidents:
        actions = db.query(ActionRequest).filter(ActionRequest.incident_id == i.id).all()
        res.append({
            "id": i.id,
            "title": i.title,
            "severity": i.severity,
            "status": i.status,
            "assignee": i.assignee,
            "timeline_notes": i.timeline_notes,
            "client_id": i.client_id,
            "source_ip": i.source_ip,
            "actions": [{"id": a.id, "type": a.action_type, "status": a.status, "target": a.target} for a in actions]
        })
    db.close()
    return {"incidents": res}

@app.get("/api/v1/intel/lookup")
def lookup_ioc(q: str, current_user: str = Depends(get_current_user)):
    is_malicious = threat_intel_service.check_ip(q)
    metadata = threat_intel_service.malicious_ips.get(q, {})
    return {
        "ioc": q,
        "is_malicious": is_malicious,
        "metadata": metadata
    }

@app.get("/api/v1/reports/executive")
def executive_report(current_user: str = Depends(get_current_user)):
    from app.core.db import SessionLocal
    from sqlalchemy import func
    db = SessionLocal()
    
    # Calculate incidents by severity
    severity_counts = db.query(Incident.severity, func.count(Incident.id)).group_by(Incident.severity).all()
    severity_breakdown = {sev: count for sev, count in severity_counts}
    
    # Dummy MTTR (Mean Time To Resolve) calculation (e.g. 2.5 hours)
    mttr_hours = 2.5
    
    total_incidents = db.query(Incident).count()
    db.close()
    
    return {
        "total_incidents": total_incidents,
        "severity_breakdown": severity_breakdown,
        "mttr_hours": mttr_hours,
        "report_generated_at": __import__('datetime').datetime.utcnow().isoformat() + "Z"
    }

@app.post("/api/v1/actions/{action_id}/approve")
def approve_action(action_id: str, current_user: str = Depends(get_current_user)):
    if playbook_executor.approve_action(action_id, "admin"):
        return {"status": "success"}
    return {"status": "failed", "message": "Action not found or already processed"}

@app.post("/api/v1/actions/{action_id}/reject")
def reject_action(action_id: str, current_user: str = Depends(get_current_user)):
    if playbook_executor.reject_action(action_id, "admin"):
        return {"status": "success"}
    return {"status": "failed", "message": "Action not found or already processed"}

# ── ClickHouse historical event queries ────────────────────────────────────

@app.get("/api/v1/events/history")
def get_event_history(
    minutes: int = 60,
    source_country: str = None,
    dest_country: str = None,
    event_type: str = None,
    limit: int = 500,
):
    """Query historical threat events from ClickHouse."""
    events = clickhouse_storage.query_events(
        minutes=min(minutes, 10080),  # Max 7 days
        source_country=source_country,
        dest_country=dest_country,
        event_type=event_type,
        limit=min(limit, 5000),
    )
    return {"events": events, "count": len(events)}

@app.get("/api/v1/events/stats")
def get_event_stats(minutes: int = 60, current_user: str = Depends(get_current_user)):
    """Get aggregated attack statistics from ClickHouse."""
    stats = clickhouse_storage.get_stats(minutes=min(minutes, 10080))
    return {"stats": stats}

@app.on_event("startup")
async def startup_event():
    # Security check for default secrets
    if settings.SECRET_KEY == "a-very-secret-key-change-this-in-production" or settings.PROXMOX_TOKEN_SECRET == "your-token-secret-here":
        logging.getLogger("uvicorn.error").critical("CRITICAL SECURITY WARNING: Default SECRET_KEY or PROXMOX_TOKEN_SECRET detected in production! Please override in .env.")
        
    # Initialize DB
    Base.metadata.create_all(bind=engine)
    
    await geoip_service.initialize()
    pipeline.start()
    await threat_intel_service.initialize()
    
    # Initialize ClickHouse (non-blocking — degrades gracefully if unavailable)
    await clickhouse_storage.initialize(host="clickhouse", port=8123)

@app.on_event("shutdown")
async def shutdown_event():
    pipeline.stop()
    geoip_service.close()
    clickhouse_storage.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
