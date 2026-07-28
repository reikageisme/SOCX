from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
import json
from app.core.db import Base

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, index=True)
    severity = Column(String)  # low, medium, high, critical
    status = Column(String, default="New")  # New, Investigating, Resolved
    assignee = Column(String, nullable=True)
    timeline_notes = Column(Text, default="[]")  # JSON list of notes
    client_id = Column(String, nullable=True, index=True)
    source_ip = Column(String, index=True)
    dest_ip = Column(String, index=True, nullable=True)
    event_count = Column(Integer, default=1)
    
    # JSON strings for lists/dicts
    mitre_tactics = Column(Text, default="[]")
    mitre_techniques = Column(Text, default="[]")
    related_events = Column(Text, default="[]") 
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    actions = relationship("ActionRequest", back_populates="incident")

    def get_mitre_tactics(self):
        return json.loads(self.mitre_tactics)
        
    def get_mitre_techniques(self):
        return json.loads(self.mitre_techniques)

class ActionRequest(Base):
    __tablename__ = "action_requests"

    id = Column(String, primary_key=True, index=True)
    incident_id = Column(String, ForeignKey("incidents.id"))
    action_type = Column(String) # block_ip, isolate_vm, disable_user
    target = Column(String)
    parameters = Column(Text, default="{}") # JSON string
    
    status = Column(String, default="pending") # pending, approved, rejected, executed, failed
    requires_approval = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    executed_at = Column(DateTime, nullable=True)
    executed_by = Column(String, nullable=True) # user who approved it or 'system'

    incident = relationship("Incident", back_populates="actions")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    actor = Column(String) # system, admin_user
    action = Column(String) # rule_triggered, playbook_executed, approval_granted
    target = Column(String) 
    details = Column(Text) # JSON string with context
