from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Dict, List, Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def uuid_str() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), index=True)
    employee_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    submitted_claims: Mapped[List[Claim]] = relationship(back_populates="submitted_by")


class Claim(Base):
    __tablename__ = "claims"

    claim_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    employee_id: Mapped[str] = mapped_column(String(64), index=True)
    employee_name: Mapped[str] = mapped_column(String(255))
    department: Mapped[str] = mapped_column(String(255), default="Unknown")
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    trip_settlement_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    trip_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    from_region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    from_country: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    from_city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    to_region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    to_country: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    to_city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    trip_activity: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    trip_boundary: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    expense_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    masked_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    trip_duration_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    destination_city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    claim_total: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="SAR")
    status: Mapped[str] = mapped_column(String(32), default="uploaded")

    case_owner_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    case_priority: Mapped[str] = mapped_column(String(32), default="standard")
    case_sla_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    case_opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    case_closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    case_tags: Mapped[List[str]] = mapped_column(JSON, default=list)
    case_watchlist: Mapped[bool] = mapped_column(Boolean, default=False)
    case_next_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    source_type: Mapped[str] = mapped_column(String(32), default="document_upload")
    source_reference: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    submitted_by_user_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.user_id"), nullable=True)

    suspicious_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    incorrect_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    risk_score_cached: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents: Mapped[List[ReceiptDocument]] = relationship(back_populates="claim", cascade="all, delete-orphan")
    detections: Mapped[List[Detection]] = relationship(back_populates="claim", cascade="all, delete-orphan")
    risk_assessment: Mapped[Optional[RiskAssessment]] = relationship(
        back_populates="claim",
        uselist=False,
        cascade="all, delete-orphan",
    )
    reviewer_decisions: Mapped[List[ReviewerDecision]] = relationship(back_populates="claim", cascade="all, delete-orphan")
    case_audit_events: Mapped[List[CaseAuditEvent]] = relationship(back_populates="claim", cascade="all, delete-orphan")
    submitted_by: Mapped[Optional[User]] = relationship(back_populates="submitted_claims")


class ReceiptDocument(Base):
    __tablename__ = "receipt_documents"

    document_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.claim_id"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    page_count: Mapped[int] = mapped_column(Integer, default=1)
    image_hash: Mapped[str] = mapped_column(String(128), index=True)
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    document_type: Mapped[str] = mapped_column(String(64), default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    claim: Mapped[Claim] = relationship(back_populates="documents")
    extracted_fields: Mapped[List[ExtractedField]] = relationship(back_populates="document", cascade="all, delete-orphan")


class ExtractedField(Base):
    __tablename__ = "extracted_fields"

    field_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    document_id: Mapped[str] = mapped_column(ForeignKey("receipt_documents.document_id"), index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    value: Mapped[str] = mapped_column(String(1024))
    normalized_value: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    page_no: Mapped[int] = mapped_column(Integer, default=1)
    bbox: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)

    document: Mapped[ReceiptDocument] = relationship(back_populates="extracted_fields")


class PolicyRule(Base):
    __tablename__ = "policy_rules"

    rule_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(64), default="general")
    threshold: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    effective_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(32), default="seed")


class Detection(Base):
    __tablename__ = "detections"

    detection_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.claim_id"), index=True)
    detection_type: Mapped[str] = mapped_column(String(120), index=True)
    severity: Mapped[str] = mapped_column(String(16), default="Low")
    human_readable_reason: Mapped[str] = mapped_column(Text)
    supporting_facts: Mapped[Dict] = mapped_column(JSON)
    source_references: Mapped[Dict] = mapped_column(JSON)
    policy_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5)
    recommended_action: Mapped[str] = mapped_column(String(120), default="Review")
    risk_weight: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    claim: Mapped[Claim] = relationship(back_populates="detections")


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"

    risk_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.claim_id"), unique=True, index=True)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    risk_level: Mapped[str] = mapped_column(String(16), default="Low")
    primary_red_flag: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    model_version: Mapped[str] = mapped_column(String(120), default="local-rules-1.0")
    contributions: Mapped[List] = mapped_column(JSON, default=list)

    claim: Mapped[Claim] = relationship(back_populates="risk_assessment")


class ReviewerDecision(Base):
    __tablename__ = "reviewer_decisions"

    decision_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.claim_id"), index=True)
    reviewer_id: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32))
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    disposition_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    claim: Mapped[Claim] = relationship(back_populates="reviewer_decisions")


class CaseAuditEvent(Base):
    __tablename__ = "case_audit_events"

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.claim_id"), index=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    severity: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    event_metadata: Mapped[Dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    claim: Mapped[Claim] = relationship(back_populates="case_audit_events")
