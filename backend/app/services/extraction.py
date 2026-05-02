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


DATE_RE = re.compile(
    r"\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b"
)
MONEY_VALUE_RE = r"([0-9][0-9,]*(?:\.[0-9]{1,2})?)"
TOTAL_DUE_RE = re.compile(
    rf"(?:total\s+due|grand\s+total|balance\s+due)\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*{MONEY_VALUE_RE}(?:\s*(?:SAR|USD|EUR|GBP))?",
    re.IGNORECASE,
)
TOTAL_RE = re.compile(rf"\btotal\b\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*{MONEY_VALUE_RE}(?:\s*(?:SAR|USD|EUR|GBP))?", re.IGNORECASE)
TAX_RE = re.compile(rf"(?:tax|vat|taxes\s+fees)\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*{MONEY_VALUE_RE}", re.IGNORECASE)
RECEIPT_RE = re.compile(r"(?:receipt|invoice)\s*(?:no|number|#)?\s*[:\-]?\s*([A-Z0-9\-]{4,})", re.IGNORECASE)
ROOM_RATE_RE = re.compile(rf"(?:room\s*rate|nightly\s*rate)\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*{MONEY_VALUE_RE}", re.IGNORECASE)
NIGHTS_RE = re.compile(r"(?:nights?)\s*[:\-]?\s*([0-9]{1,2})", re.IGNORECASE)
CITY_RE = re.compile(r"\b(Riyadh|Jeddah|Dammam|Dubai|Abu Dhabi|London|Paris|Berlin|Singapore|New York|Phoenix|Doha|Madrid|Amsterdam|Khobar|Jubail)\b", re.IGNORECASE)
FLIGHT_CLASS_RE = re.compile(r"\b(business|economy|first)\s+class\b", re.IGNORECASE)


def _is_useful_text(text: str, file_name: str = "") -> bool:
    cleaned = " ".join(text.split())
    if len(cleaned) < 40:
        return False
    if file_name and cleaned.casefold() == file_name.casefold():
        return False
    lower = cleaned.casefold()
    useful_tokens = ["invoice", "receipt", "folio", "total", "tax", "check-in", "check-out", "hotel", "amount", "sar"]
    return sum(1 for token in useful_tokens if token in lower) >= 2


def _extract_docling_text(path: Path) -> tuple[str, int]:
    from docling.document_converter import DocumentConverter

    converted = DocumentConverter().convert(str(path))
    text = converted.document.export_to_markdown()
    return text.strip(), 1


def _extract_easyocr_text(path: Path) -> tuple[str, int]:
    import easyocr

    reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    lines = reader.readtext(str(path), detail=0, paragraph=True)
    return "\n".join(str(line) for line in lines if line).strip(), 1


def _parse_money(value: str) -> str:
    return value.replace(",", "").strip()


def _clean_heading(value: str) -> str:
    return re.sub(r"^[#\-\s]+", "", value).strip()


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
        merchant = next(
            (
                line
                for line in lines[:8]
                if not line.lower().startswith(("hotel folio", "invoice", "receipt", "bill to", "check-in", "check-out"))
            ),
            lines[0],
        )
        merchant = _clean_heading(merchant)
        fields.append(_candidate("merchant", merchant[:120], 0.78 if merchant != file_name else 0.45))

    for match in DATE_RE.finditer(text):
        fields.append(_candidate("date", match.group(1), 0.78))
        break

    total_match = TOTAL_DUE_RE.search(text) or TOTAL_RE.search(text)
    if total_match:
        fields.append(_candidate("total", _parse_money(total_match.group(1)), 0.9 if TOTAL_DUE_RE.search(text) else 0.78))

    for regex, name, conf in [
        (TAX_RE, "tax", 0.75),
        (ROOM_RATE_RE, "room_rate", 0.8),
        (NIGHTS_RE, "nights", 0.72),
    ]:
        match = regex.search(text)
        if match:
            value = _parse_money(match.group(1)) if name in {"total", "tax", "room_rate"} else match.group(1)
            fields.append(_candidate(name, value, conf))

    receipt_match = RECEIPT_RE.search(text)
    if receipt_match and receipt_match.group(1).lower() not in {"date", "total"}:
        fields.append(_candidate("receipt_number", receipt_match.group(1), 0.83))

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
    extraction_errors: list[str] = []

    if mime_type == "application/pdf" or path.suffix.lower() == ".pdf":
        try:
            text, page_count = _extract_pdf_text(path)
        except Exception as exc:
            extraction_errors.append(f"pypdf: {exc}")
            text = ""
            page_count = 1

        if not _is_useful_text(text, file_name):
            try:
                text, docling_page_count = _extract_docling_text(path)
                page_count = max(page_count, docling_page_count)
            except Exception as exc:
                extraction_errors.append(f"docling: {exc}")
    elif mime_type.startswith("image/") or path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}:
        try:
            text, page_count = _extract_docling_text(path)
        except Exception as exc:
            extraction_errors.append(f"docling: {exc}")
            text = ""

        if not _is_useful_text(text, file_name):
            try:
                text, page_count = _extract_easyocr_text(path)
            except Exception as exc:
                extraction_errors.append(f"easyocr: {exc}")
    else:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception as exc:
            extraction_errors.append(f"text: {exc}")
            text = ""

    if not text:
        text = (
            f"Extraction failed for {file_name}. "
            f"Errors: {'; '.join(extraction_errors) if extraction_errors else 'No extractor returned text.'}"
        )

    document_type = _guess_doc_type(text, file_name)
    fields = _extract_fields(text, file_name)
    return ExtractionResult(document_type=document_type, extracted_text=text[:30000], fields=fields, page_count=page_count)
