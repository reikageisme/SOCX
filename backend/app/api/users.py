from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from typing import List, Optional, Any
import os
import shutil
from pydantic import BaseModel
import uuid

from app.core.db import get_db
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
def get_users(db: Any = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.users.find_one({"username": current_user})
    if not user or (user.get("role") != "superadmin" and user.get("role") != "Super_Administrator"):
        raise HTTPException(status_code=403, detail="Superadmin access required")
    
    users = list(db.users.find({}, {"_id": 0}))
    return users

@router.post("", response_model=UserResponse)
def create_user(user_in: UserCreate, db: Any = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.users.find_one({"username": current_user})
    if not user or (user.get("role") != "superadmin" and user.get("role") != "Super_Administrator"):
        raise HTTPException(status_code=403, detail="Superadmin access required")
        
    if db.users.find_one({"username": user_in.username}):
        raise HTTPException(status_code=400, detail="Username already registered")
        
    new_user = {
        "id": str(uuid.uuid4()),
        "username": user_in.username,
        "hashed_password": get_password_hash(user_in.password),
        "full_name": user_in.full_name,
        "role": user_in.role,
        "avatar_url": f"https://ui-avatars.com/api/?name={user_in.full_name.replace(' ', '+')}&background=random",
        "is_active": True
    }
    db.users.insert_one(new_user)
    return new_user

@router.get("/me", response_model=UserResponse)
def read_user_me(db: Any = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.users.find_one({"username": current_user}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/me", response_model=UserResponse)
def update_user_me(user_in: UserUpdate, db: Any = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.users.find_one({"username": current_user})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    update_data = {}
    if user_in.full_name is not None:
        update_data["full_name"] = user_in.full_name
    if user_in.avatar_url is not None:
        update_data["avatar_url"] = user_in.avatar_url
    if user_in.password is not None and len(user_in.password) > 0:
        update_data["hashed_password"] = get_password_hash(user_in.password)
        
    if update_data:
        db.users.update_one({"username": current_user}, {"$set": update_data})
        
    return db.users.find_one({"username": current_user}, {"_id": 0})

@router.post("/me/avatar")
def upload_avatar_me(file: UploadFile = File(...), db: Any = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.users.find_one({"username": current_user})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    file_ext = os.path.splitext(file.filename)[1]
    content_type = file.content_type
    if file_ext.lower() not in ['.jpg', '.jpeg', '.png', '.gif']:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPG, PNG, GIF are allowed.")
        
    file_data = file.file.read()
    
    from app.core.mongodb import mongodb_storage
    if not mongodb_storage.fs:
        raise HTTPException(status_code=500, detail="MongoDB not initialized")
        
    file_id = mongodb_storage.fs.put(file_data, filename=f"{user.get('id')}{file_ext}", content_type=content_type)
    
    avatar_url = f"/api/v1/files/{str(file_id)}"
    db.users.update_one({"username": current_user}, {"$set": {"avatar_url": avatar_url}})
    
    return {"avatar_url": avatar_url}

@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: str, user_in: UserUpdate, db: Any = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.users.find_one({"username": current_user})
    if not user or (user.get("role") != "superadmin" and user.get("role") != "Super_Administrator"):
        raise HTTPException(status_code=403, detail="Superadmin access required")
        
    target_user = db.users.find_one({"id": user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    update_data = {}
    if user_in.full_name is not None:
        update_data["full_name"] = user_in.full_name
    if user_in.role is not None:
        update_data["role"] = user_in.role
    if user_in.is_active is not None:
        update_data["is_active"] = user_in.is_active
    if user_in.password is not None and len(user_in.password) > 0:
        update_data["hashed_password"] = get_password_hash(user_in.password)
        
    if update_data:
        db.users.update_one({"id": user_id}, {"$set": update_data})
        
    return db.users.find_one({"id": user_id}, {"_id": 0})

@router.delete("/{user_id}")
def delete_user(user_id: str, db: Any = Depends(get_db), current_user: str = Depends(get_current_user)):
    user = db.users.find_one({"username": current_user})
    if not user or (user.get("role") != "superadmin" and user.get("role") != "Super_Administrator"):
        raise HTTPException(status_code=403, detail="Superadmin access required")
        
    target_user = db.users.find_one({"id": user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if target_user.get("username") == "tahnadmin":
        raise HTTPException(status_code=400, detail="Cannot delete root system admin")
        
    db.users.delete_one({"id": user_id})
    return {"status": "success"}
