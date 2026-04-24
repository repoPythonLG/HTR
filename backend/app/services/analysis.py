from __future__ import annotations

from typing import Dict, List, Tuple

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models import Claim, Detection, ExtractedField, ReceiptDocument, RiskAssessment
from app.services.explanation import generate_grounded_explanation
from app.services.extraction import extract_document
from app.services.normalization import normalize_field
from app.services.policy import get_policy_map
from app.services.rules_engine import evaluate_claim

HIGH_RISK_DETECTION_TYPES = {
    "duplicate_receipt",
    "overlapping_trips",
    "hotel_above_benchmark",
    "approver_exception_pattern",
    "amount_outlier_abnormality",
}


def _replace_document_fields(db: Session, document: ReceiptDocument, extracted_fields: List[Dict]) -> None:
    db.execute(delete(ExtractedField).where(ExtractedField.document_id == document.document_id))
    for item in extracted_fields:
        db.add(
            ExtractedField(
                document_id=document.document_id,
                name=item["name"],
                value=item["value"],
                normalized_value=item["normalized_value"],
                confidence=item["confidence"],
                page_no=item.get("page_no", 1),
                bbox=item.get("bbox"),
            )
        )


def process_document(db: Session, document: ReceiptDocument) -> None:
    # Structured claims imported from Excel already carry typed fields.
    if document.mime_type == "application/x-structured-claim" and document.extracted_fields:
        if not document.document_type:
            document.document_type = "hotel"
        return

    extraction = extract_document(
        file_path=document.file_path,
        mime_type=document.mime_type,
        file_name=document.file_name,
    )

    document.extracted_text = extraction.extracted_text
    document.document_type = extraction.document_type
    document.page_count = extraction.page_count

    fields: List[Dict] = []
    for field in extraction.fields:
        fields.append(
            {
                "name": field.name,
                "value": field.value,
                "normalized_value": normalize_field(field.name, field.value),
                "confidence": field.confidence,
                "page_no": field.page_no,
                "bbox": field.bbox,
            }
        )

    _replace_document_fields(db, document, fields)


def _compute_claim_flags(detection_payloads: List[Dict], risk: Dict) -> Tuple[bool, bool]:
    suspicious = bool(detection_payloads) or risk["risk_score"] >= 20
    incorrect = risk["risk_score"] >= 40 or any(
        payload["detection_type"] in HIGH_RISK_DETECTION_TYPES for payload in detection_payloads
    )
    return suspicious, incorrect


def analyze_claim(db: Session, claim_id: str) -> tuple[Claim, int, float, str]:
    claim = (
        db.execute(
            select(Claim)
            .options(
                joinedload(Claim.documents).joinedload(ReceiptDocument.extracted_fields),
                joinedload(Claim.detections),
                joinedload(Claim.risk_assessment),
            )
            .where(Claim.claim_id == claim_id)
        )
        .unique()
        .scalars()
        .first()
    )
    if not claim:
        raise ValueError("Claim not found")

    for document in claim.documents:
        process_document(db, document)
    db.flush()
    db.expire_all()

    claim = (
        db.execute(
            select(Claim)
            .options(joinedload(Claim.documents).joinedload(ReceiptDocument.extracted_fields))
            .where(Claim.claim_id == claim_id)
        )
        .unique()
        .scalars()
        .first()
    )
    if not claim:
        raise ValueError("Claim not found after extraction")

    policy_map = get_policy_map(db)
    detection_payloads, risk = evaluate_claim(db, claim, claim.documents, policy_map)

    db.execute(delete(Detection).where(Detection.claim_id == claim.claim_id))
    db.execute(delete(RiskAssessment).where(RiskAssessment.claim_id == claim.claim_id))

    for payload in detection_payloads:
        explanation = generate_grounded_explanation(payload)
        payload["human_readable_reason"] = explanation["reason"]
        payload["supporting_facts"]["explanation_mode"] = explanation["mode"]
        payload["supporting_facts"]["reviewer_guidance"] = explanation["reviewer_guidance"]
        db.add(Detection(claim_id=claim.claim_id, **payload))

    db.add(
        RiskAssessment(
            claim_id=claim.claim_id,
            risk_score=risk["risk_score"],
            risk_level=risk["risk_level"],
            primary_red_flag=risk["primary_red_flag"],
            model_version=settings.model_version,
            contributions=risk["contributions"],
        )
    )

    suspicious, incorrect = _compute_claim_flags(detection_payloads, risk)
    claim.suspicious_flag = suspicious
    claim.incorrect_flag = incorrect
    claim.risk_score_cached = risk["risk_score"]
    claim.status = "analyzed"

    db.commit()
    db.refresh(claim)

    return claim, len(detection_payloads), risk["risk_score"], risk["risk_level"]
