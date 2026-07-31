from fastapi import APIRouter, Depends, HTTPException
from app.api.endpoints import get_current_user
from typing import List, Optional, Any
from app.core.db import get_db
from pydantic import BaseModel
import uuid
from typing import List, Optional

router = APIRouter()

class AssetBase(BaseModel):
    hostname: str
    ip_address: str
    os_version: Optional[str] = None
    criticality: Optional[str] = "low"
    owner: Optional[str] = None
    client_id: Optional[str] = None
    cves: Optional[str] = "[]"
    protection_profile: Optional[str] = "Standard"
    waf_enabled: Optional[bool] = False

class AssetCreate(AssetBase):
    pass

class AssetResponse(AssetBase):
    id: str

    class Config:
        from_attributes = True

@router.get("/", response_model=List[AssetResponse])
def get_assets(db: Any = Depends(get_db)):
    assets = list(db.assets.find({}, {"_id": 0}))
    return assets

@router.post("/", response_model=AssetResponse)
def create_asset(asset: AssetCreate, db: Any = Depends(get_db)):
    new_asset = asset.model_dump()
    new_asset["id"] = str(uuid.uuid4())
    db.assets.insert_one(new_asset)
    return new_asset

@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: str, db: Any = Depends(get_db)):
    asset = db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset

class AssetUpdate(BaseModel):
    waf_enabled: Optional[bool] = None
    protection_profile: Optional[str] = None

@router.put("/{asset_id}")
def update_asset(asset_id: str, asset_in: AssetUpdate, db: Any = Depends(get_db)):
    update_data = {}
    if asset_in.waf_enabled is not None:
        update_data["waf_enabled"] = asset_in.waf_enabled
    if asset_in.protection_profile is not None:
        update_data["protection_profile"] = asset_in.protection_profile
        
    if update_data:
        db.assets.update_one({"id": asset_id}, {"$set": update_data})
        
    updated_asset = db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not updated_asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return updated_asset
