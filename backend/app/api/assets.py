from fastapi import APIRouter, Depends, HTTPException
from app.api.endpoints import get_current_user
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models.asset import Asset
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

class AssetCreate(AssetBase):
    pass

class AssetResponse(AssetBase):
    id: str

    class Config:
        orm_mode = True

@router.get("/", response_model=List[AssetResponse])
def get_assets(db: Session = Depends(get_db)):
    assets = db.query(Asset).all()
    return assets

@router.post("/", response_model=AssetResponse)
def create_asset(asset: AssetCreate, db: Session = Depends(get_db)):
    new_asset = Asset(
        id=str(uuid.uuid4()),
        **asset.dict()
    )
    db.add(new_asset)
    db.commit()
    db.refresh(new_asset)
    return new_asset

@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset
