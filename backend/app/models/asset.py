from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey
from datetime import datetime
from app.core.db import Base

class Asset(Base):
    __tablename__ = "assets"

    id = Column(String, primary_key=True, index=True)
    hostname = Column(String, index=True)
    ip_address = Column(String, index=True)
    os_version = Column(String, nullable=True)
    criticality = Column(String, default="low") # low, medium, high
    owner = Column(String, nullable=True)
    client_id = Column(String, nullable=True, index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
