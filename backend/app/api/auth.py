from fastapi import APIRouter, Depends, HTTPException, status
from app.api.endpoints import get_current_user
from fastapi.security import OAuth2PasswordRequestForm
from app.core.security import verify_password, create_access_token, get_password_hash

router = APIRouter()

# Users are now managed via DB

from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models.user import User

@router.post("/login/access-token")
def login_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is inactive"
        )
    
    access_token = create_access_token(subject=user.username, role=user.role)
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/users/me")
def read_users_me(current_user: str = Depends(get_current_user)):
    return {"username": "tahnadmin"}
