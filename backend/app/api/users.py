from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from pydantic import BaseModel
import uuid

from app.core.db import get_db
from app.models.user import User
from app.core.security import get_password_hash
from app.api.endpoints import get_current_user

router = APIRouter()

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    username: str
    full_name: Optional[str] = None
    role: str
    avatar_url: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True

@router.get("", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.query(User).filter(User.username == current_user).first()
    if not user or user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    
    users = db.query(User).all()
    return users

@router.post("", response_model=UserResponse)
def create_user(user_in: UserCreate, db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.query(User).filter(User.username == current_user).first()
    if not user or user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
        
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
        
    new_user = User(
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        avatar_url=f"https://ui-avatars.com/api/?name={user_in.full_name.replace(' ', '+')}&background=random"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/me", response_model=UserResponse)
def read_user_me(db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.query(User).filter(User.username == current_user).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/me", response_model=UserResponse)
def update_user_me(user_in: UserUpdate, db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.query(User).filter(User.username == current_user).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.avatar_url is not None:
        user.avatar_url = user_in.avatar_url
    if user_in.password is not None and len(user_in.password) > 0:
        user.hashed_password = get_password_hash(user_in.password)
        
    db.commit()
    db.refresh(user)
    return user

@router.post("/me/avatar")
def upload_avatar_me(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.query(User).filter(User.username == current_user).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    file_ext = os.path.splitext(file.filename)[1]
    content_type = file.content_type
    if file_ext.lower() not in ['.jpg', '.jpeg', '.png', '.gif']:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPG, PNG, GIF are allowed.")
        
    # Read file content
    file_data = file.file.read()
    
    # Store in GridFS
    from app.core.mongodb import mongodb_storage
    if not mongodb_storage.fs:
        raise HTTPException(status_code=500, detail="MongoDB not initialized")
        
    file_id = mongodb_storage.fs.put(file_data, filename=f"{user.id}{file_ext}", content_type=content_type)
    
    avatar_url = f"/api/v1/files/{str(file_id)}"
    user.avatar_url = avatar_url
    db.commit()
    db.refresh(user)
    
    return {"avatar_url": avatar_url}

@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: str, user_in: UserUpdate, db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.query(User).filter(User.username == current_user).first()
    if not user or user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
        
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user_in.full_name is not None:
        target_user.full_name = user_in.full_name
    if user_in.role is not None:
        target_user.role = user_in.role
    if user_in.is_active is not None:
        target_user.is_active = user_in.is_active
    if user_in.password is not None and len(user_in.password) > 0:
        target_user.hashed_password = get_password_hash(user_in.password)
        
    db.commit()
    db.refresh(target_user)
    return target_user

@router.delete("/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.query(User).filter(User.username == current_user).first()
    if not user or user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
        
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if target_user.username == "tahnadmin":
        raise HTTPException(status_code=400, detail="Cannot delete root system admin")
        
    db.delete(target_user)
    db.commit()
    return {"status": "success"}
