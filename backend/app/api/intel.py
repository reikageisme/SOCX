from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.endpoints import get_current_user
from app.core.threat_intel import threat_intel_service
from typing import List, Dict, Any

router = APIRouter()

@router.get("/feed", response_model=List[Dict[str, Any]])
async def get_intel_feed(current_user: str = Depends(get_current_user)):
    """Return the global threat intelligence feed"""
    return threat_intel_service.get_feed()

@router.get("/search", response_model=Dict[str, Any])
async def search_intel(q: str = Query(..., description="IP, Domain, or Hash to search"), current_user: str = Depends(get_current_user)):
    """Search for an IOC on OTX / ThreatFox"""
    if not q:
        raise HTTPException(status_code=400, detail="Query parameter 'q' is required")
        
    results = await threat_intel_service.search_ioc(q)
    return results
