from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from pypdf import PdfReader


@dataclass
class FieldCandidate:
    name: str
    value: str
    confidence: float
    page_no: int = 1
    bbox: Optional[Dict[str, Any]] = None


@dataclass
class ExtractionResult:
    document_type: str
    extracted_text: str
    fields: list[FieldCandidate]
    page_count: int


DATE_RE = re.compile(r"\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b")
TOTAL_RE = re.compile(r"(?:total|amount|grand total)\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*([0-9]+(?:\.[0-9]{1,2})?)", re.IGNORECASE)
TAX_RE = re.compile(r"(?:tax|vat)\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*([0-9]+(?:\.[0-9]{1,2})?)", re.IGNORECASE)
RECEIPT_RE = re.compile(r"(?:receipt|invoice)\s*(?:no|number|#)?\s*[:\-]?\s*([A-Z0-9\-]{4,})", re.IGNORECASE)
ROOM_RATE_RE = re.compile(r"(?:room\s*rate|nightly\s*rate)\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*([0-9]+(?:\.[0-9]{1,2})?)", re.IGNORECASE)
NIGHTS_RE = re.compile(r"(?:nights?)\s*[:\-]?\s*([0-9]{1,2})", re.IGNORECASE)
CITY_RE = re.compile(r"\b(Riyadh|Jeddah|Dammam|Dubai|Abu Dhabi|London|Paris|Berlin|Singapore|New York)\b", re.IGNORECASE)
FLIGHT_CLASS_RE = re.compile(r"\b(business|economy|first)\s+class\b", re.IGNORECASE)


def _extract_pdf_text(path: Path) -> tuple[str, int]:
    reader = PdfReader(str(path))
    pages: list[str] = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages).strip(), len(reader.pages)


def _guess_doc_type(text: str, file_name: str) -> str:
    corpus = f"{file_name} {text}".lower()
    if any(token in corpus for token in ["hotel", "folio", "room rate", "check-in"]):
        return "hotel"
    if any(token in corpus for token in ["meal", "restaurant", "breakfast", "dinner", "lunch"]):
        return "meal"
    if any(token in corpus for token in ["taxi", "uber", "transport", "ride"]):
        return "transport"
    if any(token in corpus for token in ["flight", "boarding", "airline", "itinerary"]):
        return "flight"
    if any(token in corpus for token in ["conference", "summit", "registration"]):
        return "conference"
    if any(token in corpus for token in ["claim form", "reimbursement form"]):
        return "claim_form"
    if any(token in corpus for token in ["invoice", "receipt"]):
        return "generic_invoice"
    return "unknown"


def _candidate(name: str, value: str, confidence: float) -> FieldCandidate:
    return FieldCandidate(name=name, value=value.strip(), confidence=confidence)


def _extract_fields(text: str, file_name: str) -> list[FieldCandidate]:
    fields: list[FieldCandidate] = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if lines:
        fields.append(_candidate("merchant", lines[0][:120], 0.55))

    for match in DATE_RE.finditer(text):
        fields.append(_candidate("date", match.group(1), 0.78))
        break

    for regex, name, conf in [
        (TOTAL_RE, "total", 0.82),
        (TAX_RE, "tax", 0.75),
        (RECEIPT_RE, "receipt_number", 0.83),
        (ROOM_RATE_RE, "room_rate", 0.8),
        (NIGHTS_RE, "nights", 0.72),
    ]:
        match = regex.search(text)
        if match:
            fields.append(_candidate(name, match.group(1), conf))

    city_match = CITY_RE.search(text)
    if city_match:
        fields.append(_candidate("city", city_match.group(1), 0.7))

    class_match = FLIGHT_CLASS_RE.search(text)
    if class_match:
        fields.append(_candidate("flight_class", f"{class_match.group(1).lower()} class", 0.85))

    corpus = f"{file_name} {text}".lower()
    if "meal included" in corpus or "breakfast included" in corpus:
        fields.append(_candidate("meal_included", "true", 0.9))
    if "booking channel" in corpus and "non-compliant" in corpus:
        fields.append(_candidate("booking_channel", "non_compliant", 0.7))

    return fields


def extract_document(file_path: str, mime_type: str, file_name: str) -> ExtractionResult:
    path = Path(file_path)
    text = ""
    page_count = 1

    if mime_type == "application/pdf" or path.suffix.lower() == ".pdf":
        try:
            text, page_count = _extract_pdf_text(path)
        except Exception:
            text = ""
            page_count = 1
    else:
        # OCR is intentionally optional for local setup. We use file text and name heuristics
        # so the pipeline remains deterministic and testable even without OCR dependencies.
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            text = ""

    if not text:
        text = f"{file_name}"

    document_type = _guess_doc_type(text, file_name)
    fields = _extract_fields(text, file_name)
    return ExtractionResult(document_type=document_type, extracted_text=text[:30000], fields=fields, page_count=page_count)
