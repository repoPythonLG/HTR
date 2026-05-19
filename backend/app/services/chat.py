from __future__ import annotations

import json
from typing import Any, Dict, Iterator, List, Tuple

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Claim, ReceiptDocument

MAX_DOCUMENT_TEXT_CONTEXT_CHARS = 30000


def _stored_text_is_placeholder(document: ReceiptDocument) -> bool:
    text = " ".join((document.extracted_text or "").split())
    if not text:
        return True
    if text.casefold() == document.file_name.casefold():
        return True
    if text.startswith("Extraction failed for "):
        return True
    useful_tokens = ["invoice", "receipt", "folio", "total", "tax", "check-in", "check-out", "hotel", "amount", "sar"]
    return len(text) < 40 or sum(1 for token in useful_tokens if token in text.casefold()) < 2


def _display_label(value: str | None) -> str:
    if not value:
        return "Not recorded"
    labels = {
        "amount_outlier_abnormality": "Daily Cost Outlier",
        "amount_above_peer_mean_threshold": "Daily Cost Above Peer Mean",
        "location_cost_anomaly": "Location-Adjusted Daily Cost Anomaly",
    }
    if value in labels:
        return labels[value]
    return value.replace("_", " ").replace("-", " ").title()


def _document_text_from_database(document: ReceiptDocument) -> Tuple[str, Dict[str, Any]]:
    text = document.extracted_text or ""
    if not text.strip():
        return "", {
            "source": "stored_extracted_text",
            "status": "missing",
            "extraction_lifecycle": "upload_only",
            "note": "No stored extraction is available. Upload/reprocess the document instead of extracting during chat.",
        }

    if _stored_text_is_placeholder(document):
        return text, {
            "source": "stored_extracted_text",
            "status": "stored_placeholder_or_failed_extraction",
            "extraction_lifecycle": "upload_only",
            "note": "Chat uses the stored extraction result and does not re-run Docling or EasyOCR.",
        }

    return text, {
        "source": "stored_extracted_text",
        "status": "available",
        "extraction_lifecycle": "upload_only",
        "note": "Extracted once during upload; reused from database for chat.",
    }


def _compact_json(value: Any) -> str:
    return json.dumps(value, default=str, ensure_ascii=False, indent=2)


def _money(value: Any, currency: str = "SAR") -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "not recorded"
    return f"{number:,.2f} {currency}"


def _percent(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "not recorded"
    return f"{number:,.2f}%"


def _finding_reviewer_comparison(detection_type: str, facts: Dict[str, Any], claim: Claim) -> Dict[str, Any]:
    label = _display_label(detection_type)
    comparison: Dict[str, Any] = {
        "finding": label,
        "plain_english": "",
        "comparison_points": [],
        "reviewer_focus": [],
    }

    if detection_type in {"trip_overlap_rule", "overlapping_trips"}:
        related_ids = facts.get("related_claims") or facts.get("overlapping_claims") or facts.get("overlapping_claim_ids") or []
        related = _related_claim_summaries(related_ids if isinstance(related_ids, list) else [])
        comparison["plain_english"] = "Trip dates overlap with another travel expense entry for the same employee."
        comparison["comparison_points"].append(
            f"Current entry travel window: {claim.start_date} to {claim.end_date} ({claim.trip_duration_days} days)."
        )
        for item in related:
            comparison["comparison_points"].append(
                "Related entry {trip_number}: {start_date} to {end_date}, {destination}, {amount}, employee {employee_id}.".format(
                    trip_number=item.get("trip_number") or item.get("entry_id"),
                    start_date=item.get("start_date"),
                    end_date=item.get("end_date"),
                    destination=item.get("destination"),
                    amount=_money(item.get("amount"), claim.currency),
                    employee_id=item.get("employee_id"),
                )
            )
        if not related and related_ids:
            comparison["comparison_points"].append(f"Related overlapping entry ids: {', '.join(str(item) for item in related_ids)}.")
        comparison["related_entries"] = related
        comparison["reviewer_focus"] = [
            "Check whether the employee could reasonably be in both destinations during the overlap.",
            "Compare receipts, hotel dates, travel approvals, and booking records for both entries.",
        ]
    elif detection_type == "amount_above_peer_mean_threshold":
        amount = facts.get("claim_amount") or claim.claim_total
        duration = facts.get("trip_duration_days") or claim.trip_duration_days or 1
        daily_amount = facts.get("claim_daily_amount")
        mean = facts.get("peer_mean_daily_amount") or facts.get("peer_mean")
        threshold_amount = facts.get("daily_threshold_amount") or facts.get("threshold_amount")
        uplift = facts.get("uplift_vs_daily_mean_pct") or facts.get("uplift_vs_mean_pct")
        threshold_pct = facts.get("configured_threshold_pct")
        comparison["plain_english"] = "Daily cost is above the configured peer daily-mean threshold."
        comparison["comparison_points"] = [
            f"This entry total: {_money(amount, claim.currency)} across {duration} days.",
            f"This entry daily cost: {_money(daily_amount, claim.currency)} per day.",
            f"Peer daily mean: {_money(mean, claim.currency)} per day.",
            f"Configured daily limit: {_money(threshold_amount, claim.currency)} per day ({_percent(threshold_pct)} above peer daily mean).",
            f"Variance versus peer daily mean: {_percent(uplift)}.",
        ]
        comparison["reviewer_focus"] = ["Verify itemised invoice lines and business justification for the variance."]
    elif detection_type in {"location_adjusted_threshold_pct", "location_cost_anomaly"}:
        amount = facts.get("claim_amount") or claim.claim_total
        duration = facts.get("trip_duration_days") or claim.trip_duration_days or 1
        daily_amount = facts.get("claim_daily_amount")
        adjusted_amount = (
            facts.get("location_adjusted_daily_amount")
            or facts.get("location_adjusted_claim_amount")
            or facts.get("location_adjusted_amount")
        )
        adjusted_mean = (
            facts.get("peer_mean_location_adjusted_daily_amount")
            or facts.get("peer_mean_location_adjusted_amount")
            or facts.get("adjusted_peer_mean")
        )
        adjusted_limit = (
            facts.get("location_adjusted_daily_threshold_amount")
            or facts.get("location_adjusted_threshold_amount")
            or facts.get("adjusted_limit")
        )
        factor = facts.get("location_cost_factor")
        uplift = facts.get("uplift_vs_location_adjusted_mean_pct")
        comparison["plain_english"] = "Daily cost remains high after adjusting for destination country/city cost level."
        comparison["comparison_points"] = [
            f"This entry total: {_money(amount, claim.currency)} across {duration} days.",
            f"This entry daily cost: {_money(daily_amount, claim.currency)} per day.",
            f"Location-adjusted daily cost: {_money(adjusted_amount, claim.currency)} per day.",
            f"Adjusted peer daily mean: {_money(adjusted_mean, claim.currency)} per day.",
            f"Adjusted daily limit: {_money(adjusted_limit, claim.currency)} per day.",
            f"Variance versus location-adjusted peer mean: {_percent(uplift)}.",
            f"Destination cost factor: {factor if factor is not None else 'not recorded'}.",
        ]
        comparison["reviewer_focus"] = ["Check whether destination pricing explains the amount; if not, request itemised support."]
    elif detection_type in {"outlier_min_sample_size", "amount_outlier_abnormality"}:
        amount = facts.get("claim_amount") or claim.claim_total
        duration = facts.get("trip_duration_days") or claim.trip_duration_days or 1
        daily_amount = facts.get("claim_daily_amount")
        mean = facts.get("peer_mean_daily_amount") or facts.get("peer_mean")
        median = facts.get("peer_median_daily_amount") or facts.get("peer_median")
        upper = facts.get("daily_iqr_upper_bound") or facts.get("iqr_upper_bound")
        z_score = facts.get("z_score")
        robust = facts.get("robust_z_score")
        comparison["plain_english"] = "Daily cost is statistically outside the normal peer distribution."
        comparison["comparison_points"] = [
            f"This entry total: {_money(amount, claim.currency)} across {duration} days.",
            f"This entry daily cost: {_money(daily_amount, claim.currency)} per day.",
            f"Peer daily median: {_money(median, claim.currency)} per day.",
            f"Peer daily mean: {_money(mean, claim.currency)} per day.",
            f"Daily outlier upper bound: {_money(upper, claim.currency)} per day.",
            f"Z-score: {z_score if z_score is not None else 'not recorded'}; robust z-score: {robust if robust is not None else 'not recorded'}.",
        ]
        comparison["reviewer_focus"] = ["Compare against similar activity, boundary, country/city, and expense type."]
    else:
        comparison["plain_english"] = "This finding contributes to the overall risk score."
        comparison["comparison_points"] = [f"Supporting facts are available under the {label} finding."]
        comparison["reviewer_focus"] = ["Review source evidence and compare against policy before disposition."]

    return comparison


def _related_claim_summaries(claim_ids: List[Any]) -> List[Dict[str, Any]]:
    ids = [str(item) for item in claim_ids if item]
    if not ids:
        return []
    try:
        with SessionLocal() as db:
            related_claims = db.query(Claim).filter(Claim.claim_id.in_(ids)).all()
            return [
                {
                    "entry_id": item.claim_id,
                    "trip_number": item.trip_number,
                    "employee_id": item.employee_id,
                    "employee_name": item.employee_name,
                    "destination": ", ".join(part for part in [item.to_city or item.destination_city, item.to_country] if part),
                    "start_date": item.start_date,
                    "end_date": item.end_date,
                    "duration_days": item.trip_duration_days,
                    "amount": item.claim_total,
                    "status": item.status,
                }
                for item in related_claims
            ]
    except Exception:
        return []


def build_claim_chat_context(claim: Claim) -> Tuple[str, List[str], Dict[str, Any]]:
    document_sections: List[Dict[str, Any]] = []
    extraction_status: Dict[str, Any] = {}

    for document in claim.documents:
        text, status = _document_text_from_database(document)
        full_text = text or ""
        context_text = full_text[:MAX_DOCUMENT_TEXT_CONTEXT_CHARS]
        extraction_status[document.document_id] = {
            "file_name": document.file_name,
            "full_text_chars": len(full_text),
            "context_text_chars": len(context_text),
            "complete_text_in_context": len(full_text) == len(context_text),
            **status,
        }
        document_sections.append(
            {
                "file_name": document.file_name,
                "mime_type": document.mime_type,
                "document_type": document.document_type,
                "extracted_text": context_text,
                "extracted_text_chars": len(full_text),
                "complete_text_in_context": len(full_text) == len(context_text),
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

    reviewer_findings = [
        _finding_reviewer_comparison(detection.detection_type, detection.supporting_facts or {}, claim)
        for detection in claim.detections
    ]

    context = {
        "reviewer_brief": {
            "important_instruction": (
                "When answering questions such as 'what is wrong with this entry', use the reviewer_findings_comparison "
                "section first. Give actual-vs-limit comparisons, overlap dates/records where available, and practical "
                "verification steps. Use markdown with bold finding headings."
            ),
            "entry_headline": {
                "entry_id": claim.claim_id,
                "trip_number": claim.trip_number,
                "employee_id": claim.employee_id,
                "destination": [claim.to_city or claim.destination_city, claim.to_country, claim.to_region],
                "amount": claim.claim_total,
                "currency": claim.currency,
                "risk_score": claim.risk_assessment.risk_score if claim.risk_assessment else claim.risk_score_cached,
                "risk_level": claim.risk_assessment.risk_level if claim.risk_assessment else None,
                "primary_red_flag": claim.risk_assessment.primary_red_flag if claim.risk_assessment else None,
            },
            "reviewer_findings_comparison": reviewer_findings,
        },
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
        "Chat context is ready, but the Qwen/OpenAI-compatible chat settings are not complete. "
        "Set QWEN_API_KEY or DASHSCOPE_API_KEY to enable live LLM answers. "
        "The endpoint and model can be changed with QWEN_BASE_URL and QWEN_MODEL."
    )


def _fallback_missing_dependency(error: Exception) -> str:
    return f"Chat context is ready, but LangChain chat dependencies are not installed: {error}"


def _build_chat_messages(claim: Claim, message: str, history: List[Dict[str, str]]) -> Tuple[List[Any], List[str], Dict[str, Any]]:
    context, sources, extraction_status = build_claim_chat_context(claim)

    system_prompt = (
        "You are an enterprise travel expense investigation assistant for SABIC reviewers. "
        "Answer using only the provided case context. Be concise, factual, and business-friendly. "
        "If the evidence is missing or uncertain, say so clearly and suggest what the reviewer should verify. "
        "Never invent receipts, dates, amounts, policy rules, or decisions. "
        "Use 'travel expense entry' or 'entry', not 'claim'. If raw context field names contain 'claim', translate them "
        "for the user as 'entry' or 'travel expense entry'. "
        "For 'what is wrong' questions, structure the response as markdown: start with a one-sentence summary, then "
        "list each issue with a bold heading in the exact form **Finding Name (Severity)**. "
        "For every issue, include the comparison evidence from reviewer_findings_comparison: actual value versus policy limit, "
        "peer mean, threshold, location-adjusted limit, or overlapping entry details. "
        "Do not focus on malformed OCR/extraction fields unless the user asks about receipt extraction quality. "
        "Do not give generic actions without the supporting numbers or dates.\n\n"
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


def build_claim_chat_debug(claim: Claim, message: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
    messages, sources, extraction_status = _build_chat_messages(claim, message, history)
    serialized_messages = [
        {
            "role": message_item.__class__.__name__.replace("Message", "").lower(),
            "content": getattr(message_item, "content", ""),
        }
        for message_item in messages
    ]
    context, _, _ = build_claim_chat_context(claim)
    return {
        "model": settings.chat_vllm_model if _chat_settings_ready() else "not-configured",
        "base_url": settings.chat_vllm_base_url,
        "settings_ready": _chat_settings_ready(),
        "context_sources": sources,
        "extraction_status": extraction_status,
        "messages": serialized_messages,
        "case_context": json.loads(context),
    }


def _chat_llm():
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.chat_vllm_model,
        base_url=settings.chat_vllm_base_url,
        api_key=settings.chat_vllm_api_key,
        temperature=settings.chat_vllm_temperature,
        timeout=settings.chat_vllm_timeout_seconds,
        streaming=True,
    )


def _chat_settings_ready() -> bool:
    return bool(settings.chat_vllm_base_url and settings.chat_vllm_model and settings.chat_vllm_api_key)


def answer_claim_chat(claim: Claim, message: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
    if not _chat_settings_ready():
        _, sources, extraction_status = build_claim_chat_context(claim)
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
        sources = []
        extraction_status: Dict[str, Any] = {}
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
    if not _chat_settings_ready():
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
