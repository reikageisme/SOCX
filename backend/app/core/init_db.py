from app.core.db import SessionLocal, Base, engine
from app.models.user import User
from app.core.security import get_password_hash

def init_db():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Check if tahnadmin exists
        tahnadmin = db.query(User).filter(User.username == "tahnadmin").first()
        if not tahnadmin:
            superuser = User(
                username="tahnadmin",
                hashed_password=get_password_hash("T@hn_Admin!2026$"),
                full_name="System Administrator",
                role="superadmin",
                avatar_url="https://ui-avatars.com/api/?name=System+Admin&background=0D8ABC&color=fff"
            )
            db.add(superuser)
            db.commit()
    except Exception as e:
        print(f"Error seeding DB: {e}")
    finally:
        db.close()
