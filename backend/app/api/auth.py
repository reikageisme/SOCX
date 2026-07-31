from fastapi import APIRouter, Depends, HTTPException, status
from app.api.endpoints import get_current_user
from fastapi.security import OAuth2PasswordRequestForm
from app.core.security import verify_password, create_access_token, get_password_hash

router = APIRouter()

# Users are now managed via DB

from typing import Any
from app.core.db import get_db

@router.post("/login/access-token")
def login_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Any = Depends(get_db)):
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = db.users.find_one({"username": form_data.username})
    if not user or not verify_password(form_data.password, user.get("hashed_password")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    if not user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is inactive"
        )
    
    access_token = create_access_token(subject=user.get("username"), role=user.get("role"))
    return {"access_token": access_token, "token_type": "bearer"}
