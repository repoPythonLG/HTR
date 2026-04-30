from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterator, List, Tuple

from app.core.config import settings
from app.models import Claim, ReceiptDocument


def _display_label(value: str | None) -> str:
    if not value:
        return "Not recorded"
    return value.replace("_", " ").replace("-", " ").title()


def _document_text_with_optional_ocr(document: ReceiptDocument) -> Tuple[str, Dict[str, Any]]:
    if document.extracted_text:
        return document.extracted_text, {"source": "stored_extracted_text", "status": "available"}

    path = Path(document.file_path)
    if not path.exists():
        return "", {"source": "file", "status": "missing"}

    try:
        from docling.document_converter import DocumentConverter

        converted = DocumentConverter().convert(str(path))
        text = converted.document.export_to_markdown()
        if text.strip():
            return text, {"source": "docling", "status": "extracted"}
    except Exception as exc:  # pragma: no cover - optional integration depends on local native packages
        docling_error = str(exc)
    else:
        docling_error = "No text returned"

    if document.mime_type.startswith("image/"):
        try:
            import easyocr

            reader = easyocr.Reader(["en"], gpu=False)
            lines = reader.readtext(str(path), detail=0, paragraph=True)
            text = "\n".join(str(line) for line in lines if line)
            if text.strip():
                return text, {"source": "easyocr", "status": "extracted"}
        except Exception as exc:  # pragma: no cover - optional integration depends on local native packages
            return "", {"source": "easyocr", "status": "failed", "error": str(exc), "docling_error": docling_error}

    return "", {"source": "docling", "status": "failed", "error": docling_error}


def _compact_json(value: Any) -> str:
    return json.dumps(value, default=str, ensure_ascii=False, indent=2)


def build_claim_chat_context(claim: Claim) -> Tuple[str, List[str], Dict[str, Any]]:
    document_sections: List[Dict[str, Any]] = []
    extraction_status: Dict[str, Any] = {}

    for document in claim.documents:
        text, status = _document_text_with_optional_ocr(document)
        extraction_status[document.document_id] = {
            "file_name": document.file_name,
            **status,
        }
        document_sections.append(
            {
                "file_name": document.file_name,
                "mime_type": document.mime_type,
                "document_type": document.document_type,
                "extracted_text": text[:6000] if text else "",
                "extracted_fields": [
                    {
                        "name": field.name,
                        "value": field.value,
                        "normalized_value": field.normalized_value,
                        "confidence": field.confidence,
                    }
                    for field in document.extracted_fields
                ],
            }
        )

    context = {
        "travel_expense_entry": {
            "entry_id": claim.claim_id,
            "employee": {"id": claim.employee_id, "name": claim.employee_name, "department": claim.department},
            "trip": {
                "trip_number": claim.trip_number,
                "activity": claim.trip_activity,
                "boundary": claim.trip_boundary,
                "from": [claim.from_city, claim.from_country, claim.from_region],
                "to": [claim.to_city or claim.destination_city, claim.to_country, claim.to_region],
                "start_date": claim.start_date,
                "end_date": claim.end_date,
                "settlement_date": claim.trip_settlement_date,
                "duration_days": claim.trip_duration_days,
            },
            "expense": {
                "type": claim.expense_type,
                "amount": claim.claim_total,
                "currency": claim.currency,
                "status": claim.status,
                "suspicious_flag": claim.suspicious_flag,
                "incorrect_flag": claim.incorrect_flag,
            },
        },
        "findings_and_evidence": [
            {
                "type": _display_label(detection.detection_type),
                "severity": detection.severity,
                "reason": detection.human_readable_reason,
                "supporting_facts": detection.supporting_facts,
                "source_references": detection.source_references,
                "recommended_action": detection.recommended_action,
                "risk_weight": detection.risk_weight,
            }
            for detection in claim.detections
        ],
        "risk_assessment": {
            "score": claim.risk_assessment.risk_score if claim.risk_assessment else claim.risk_score_cached,
            "level": claim.risk_assessment.risk_level if claim.risk_assessment else None,
            "primary_red_flag": claim.risk_assessment.primary_red_flag if claim.risk_assessment else None,
            "model_version": claim.risk_assessment.model_version if claim.risk_assessment else settings.model_version,
            "contributions": claim.risk_assessment.contributions if claim.risk_assessment else [],
        },
        "case_file": {
            "owner": claim.case_owner_id,
            "priority": claim.case_priority,
            "sla_due_at": claim.case_sla_due_at,
            "opened_at": claim.case_opened_at,
            "closed_at": claim.case_closed_at,
            "tags": claim.case_tags or [],
            "watchlist": claim.case_watchlist,
            "next_action": claim.case_next_action,
        },
        "decisions": [
            {
                "reviewer_id": decision.reviewer_id,
                "status": decision.status,
                "reason": decision.disposition_reason,
                "notes": decision.notes,
                "timestamp": decision.timestamp,
            }
            for decision in claim.reviewer_decisions
        ],
        "audit_timeline": [
            {
                "type": event.event_type,
                "title": event.title,
                "description": event.description,
                "actor": event.actor_id,
                "severity": event.severity,
                "timestamp": event.created_at,
                "metadata": event.event_metadata,
            }
            for event in claim.case_audit_events
        ],
        "attached_receipts": document_sections,
    }

    sources = [
        "travel expense table entry",
        "findings and evidence",
        "case file",
        "decision history",
        "audit timeline",
        "attached receipt extraction",
    ]
    return _compact_json(context), sources, extraction_status


def _fallback_not_configured() -> str:
    return (
        "Chat context is ready, but the vLLM endpoint is not configured. Set "
        "CHAT_VLLM_BASE_URL, CHAT_VLLM_MODEL, and CHAT_VLLM_API_KEY to enable live LLM answers."
    )


def _fallback_missing_dependency(error: Exception) -> str:
    return f"Chat context is ready, but LangChain chat dependencies are not installed: {error}"


def _build_chat_messages(claim: Claim, message: str, history: List[Dict[str, str]]) -> Tuple[List[Any], List[str], Dict[str, Any]]:
    context, sources, extraction_status = build_claim_chat_context(claim)

    system_prompt = (
        "You are an enterprise travel expense investigation assistant for SABIC reviewers. "
        "Answer using only the provided case context. Be concise, factual, and business-friendly. "
        "If the evidence is missing or uncertain, say so clearly and suggest what the reviewer should verify. "
        "Never invent receipts, dates, amounts, policy rules, or decisions.\n\n"
        f"CASE CONTEXT:\n{context}"
    )

    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    messages: List[Any] = [SystemMessage(content=system_prompt)]
    for item in history[-12:]:
        role = item.get("role")
        content = item.get("content", "")
        if role == "assistant":
            messages.append(AIMessage(content=content))
        elif role == "user":
            messages.append(HumanMessage(content=content))
    messages.append(HumanMessage(content=message))
    return messages, sources, extraction_status


def _chat_llm():
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.chat_vllm_model,
        base_url=settings.chat_vllm_base_url,
        api_key=settings.chat_vllm_api_key or "EMPTY",
        temperature=settings.chat_vllm_temperature,
        timeout=settings.chat_vllm_timeout_seconds,
        streaming=True,
    )


def answer_claim_chat(claim: Claim, message: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
    _, sources, extraction_status = build_claim_chat_context(claim)

    if not settings.chat_vllm_base_url:
        return {
            "answer": _fallback_not_configured(),
            "model": "not-configured",
            "context_sources": sources,
            "extraction_status": extraction_status,
        }

    try:
        messages, sources, extraction_status = _build_chat_messages(claim, message, history)
        llm = _chat_llm()
    except Exception as exc:  # pragma: no cover - optional integration depends on installed packages
        return {
            "answer": _fallback_missing_dependency(exc),
            "model": "dependency-missing",
            "context_sources": sources,
            "extraction_status": extraction_status,
        }

    response = llm.invoke(messages)
    return {
        "answer": str(response.content),
        "model": settings.chat_vllm_model,
        "context_sources": sources,
        "extraction_status": extraction_status,
    }


def stream_claim_chat(claim: Claim, message: str, history: List[Dict[str, str]]) -> Iterator[str]:
    if not settings.chat_vllm_base_url:
        yield _fallback_not_configured()
        return

    try:
        messages, _, _ = _build_chat_messages(claim, message, history)
        llm = _chat_llm()
    except Exception as exc:  # pragma: no cover - optional integration depends on installed packages
        yield _fallback_missing_dependency(exc)
        return

    for chunk in llm.stream(messages):
        content = getattr(chunk, "content", "")
        if isinstance(content, list):
            text = "".join(str(part) for part in content)
        else:
            text = str(content)
        if text:
            yield text
