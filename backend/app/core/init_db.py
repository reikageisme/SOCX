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
        
        # Upsert Departments
        departments = [
            { "id": "DEPT_01", "name": "Security Operations Center (SOC)", "code": "SOC" },
            { "id": "DEPT_02", "name": "Offensive Security (Red Team)", "code": "RED" },
            { "id": "DEPT_03", "name": "Infrastructure & DevOps", "code": "INFRA" },
            { "id": "DEPT_04", "name": "Management", "code": "BOD" }
        ]
        for dept in departments:
            db.departments.update_one({"id": dept["id"]}, {"$set": dept}, upsert=True)

        # Upsert Users
        users = [
            {
                "username": "tahnadmin",
                "hashed_password": get_password_hash("T@hn_Admin!2026$"),
                "full_name": "Phạm Tuấn Anh",
                "role": "Super_Administrator",
                "departmentId": "DEPT_04",
                "alias": "ReiKage",
                "avatar_url": "https://ui-avatars.com/api/?name=Phạm+Tuấn+Anh&background=0D8ABC&color=fff",
                "is_active": True,
                "created_at": datetime.datetime.utcnow().isoformat() + "Z"
            },
            {
                "username": "phong.thanh",
                "hashed_password": get_password_hash("Welcome@123"),
                "full_name": "Thanh Phong",
                "role": "SOC_Analyst_Tier2",
                "departmentId": "DEPT_01",
                "alias": None,
                "avatar_url": "https://ui-avatars.com/api/?name=Thanh+Phong",
                "is_active": True,
                "created_at": datetime.datetime.utcnow().isoformat() + "Z"
            },
            {
                "username": "bao.sec",
                "hashed_password": get_password_hash("Welcome@123"),
                "full_name": "Bảo",
                "role": "Penetration_Tester",
                "departmentId": "DEPT_02",
                "alias": None,
                "avatar_url": "https://ui-avatars.com/api/?name=Bảo",
                "is_active": True,
                "created_at": datetime.datetime.utcnow().isoformat() + "Z"
            },
            {
                "username": "dat.ops",
                "hashed_password": get_password_hash("Welcome@123"),
                "full_name": "Đạt",
                "role": "DevOps_Engineer",
                "departmentId": "DEPT_03",
                "alias": None,
                "avatar_url": "https://ui-avatars.com/api/?name=Đạt",
                "is_active": True,
                "created_at": datetime.datetime.utcnow().isoformat() + "Z"
            },
            {
                "username": "nam.auditor",
                "hashed_password": get_password_hash("Welcome@123"),
                "full_name": "Nam",
                "role": "Security_Auditor",
                "departmentId": "DEPT_01",
                "alias": None,
                "avatar_url": "https://ui-avatars.com/api/?name=Nam",
                "is_active": True,
                "created_at": datetime.datetime.utcnow().isoformat() + "Z"
            }
        ]
        
        for user in users:
            existing = db.users.find_one({"username": user["username"]})
            if not existing:
                user["id"] = str(uuid.uuid4())
                db.users.insert_one(user)
            else:
                # Update role and metadata to ensure correct RBAC
                db.users.update_one(
                    {"username": user["username"]},
                    {"$set": {
                        "role": user["role"],
                        "full_name": user["full_name"],
                        "departmentId": user["departmentId"]
                    }}
                )

        # Upsert Assets
        assets = [
            { "assetId": "AST_001", "name": "ACEDA IMS Platform", "domain": "aceda.id.vn", "ipAddress": "192.168.56.101", "type": "Web_Application", "criticality": "High", "owner": "tahnadmin" },
            { "assetId": "AST_002", "name": "Core Database Server", "domain": "db.local", "ipAddress": "192.168.56.102", "type": "Database", "criticality": "Critical", "owner": "dat.ops" },
            { "assetId": "AST_003", "name": "ACS Edge Firewall", "domain": "fw.local", "ipAddress": "192.168.56.1", "type": "pfSense_Gateway", "criticality": "Critical", "owner": "dat.ops" },
            { "assetId": "AST_004", "name": "CT100 Testing Node", "domain": "ct100.local", "ipAddress": "192.168.56.100", "type": "LXC_Container", "criticality": "Low", "owner": "bao.sec" }
        ]
        
        for asset in assets:
            # Map JSON keys to backend schema keys
            asset_doc = {
                "id": asset["assetId"],
                "name": asset["name"],
                "ip": asset["ipAddress"],
                "domain": asset["domain"],
                "type": asset["type"],
                "status": "online",
                "criticality": asset["criticality"].lower(),
                "owner": asset["owner"],
                "updated_at": datetime.datetime.utcnow().isoformat() + "Z"
            }
            db.assets.update_one({"id": asset_doc["id"]}, {"$set": asset_doc}, upsert=True)
            
    except Exception as e:
        print(f"Error seeding MongoDB: {e}")
