from fastapi import APIRouter, Depends, HTTPException, status
from app.api.endpoints import get_current_user
from fastapi.security import OAuth2PasswordRequestForm
from app.core.security import verify_password, create_access_token, get_password_hash

router = APIRouter()

# Mock user database for Phase 1
# In a real app, this would be a DB call
MOCK_USERS = {
    "tahnadmin": {
        "username": "tahnadmin",
        # "T@hn_Admin!2026$" hashed
        "hashed_password": get_password_hash("T@hn_Admin!2026$"),
        "role": "admin"
    },
    "sysadmin": {
        "username": "sysadmin",
        "hashed_password": get_password_hash("sysadmin"),
        "role": "sysadmin"
    },
    "auditor": {
        "username": "auditor",
        "hashed_password": get_password_hash("auditor"),
        "role": "auditor"
    }
}

@router.post("/login/access-token")
def login_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = MOCK_USERS.get(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    
    access_token = create_access_token(subject=user["username"], role=user["role"])
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/users/me")
def read_users_me(current_user: str = Depends(get_current_user)):
    return {"username": "tahnadmin"}
