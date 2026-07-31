from app.core.mongodb import mongodb_storage
from app.core.security import get_password_hash
import uuid
import datetime

def init_db():
    db = mongodb_storage.db
    if db is None:
        print("Error: MongoDB not initialized before init_db()")
        return
        
    try:
        # Create unique indexes
        db.users.create_index("username", unique=True)
        
        # Check if tahnadmin exists
        tahnadmin = db.users.find_one({"username": "tahnadmin"})
        if not tahnadmin:
            superuser = {
                "id": str(uuid.uuid4()),
                "username": "tahnadmin",
                "hashed_password": get_password_hash("T@hn_Admin!2026$"),
                "full_name": "System Administrator",
                "role": "superadmin",
                "avatar_url": "https://ui-avatars.com/api/?name=System+Admin&background=0D8ABC&color=fff",
                "is_active": True,
                "created_at": datetime.datetime.utcnow().isoformat() + "Z"
            }
            db.users.insert_one(superuser)
    except Exception as e:
        print(f"Error seeding MongoDB: {e}")
