from __future__ import annotations

import re
from datetime import datetime

from dateutil import parser


def normalize_date(value: str) -> str:
    try:
        parsed = parser.parse(value, dayfirst=False)
        return parsed.date().isoformat()
    except Exception:
        return value


def normalize_currency(value: str) -> str:
    upper = value.upper().replace(" ", "")
    if upper in {"SAR", "USD", "EUR", "GBP"}:
        return upper
    if upper in {"﷼", "SR", "SAR."}:
        return "SAR"
    return upper


def normalize_vendor(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9 ]+", "", value).strip()
    return re.sub(r"\s+", " ", sanitized).upper()


def normalize_city(value: str) -> str:
    return value.strip().title()


def normalize_receipt_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "", value).upper()


def normalize_numeric(value: str) -> str:
    sanitized = re.sub(r"[^0-9.]", "", value)
    try:
        return f"{float(sanitized):.2f}"
    except Exception:
        return value


def normalize_field(name: str, value: str) -> str:
    key = name.lower()
    if key in {"date", "start_date", "end_date"}:
        return normalize_date(value)
    if key == "merchant":
        return normalize_vendor(value)
    if key == "city":
        return normalize_city(value)
    if key in {"receipt_number", "invoice_number"}:
        return normalize_receipt_id(value)
    if key in {"total", "tax", "room_rate", "nights", "claim_total"}:
        return normalize_numeric(value)
    if key == "currency":
        return normalize_currency(value)
    if key == "flight_class":
        return value.lower().strip()
    if key == "meal_included":
        return "true" if value.lower() in {"true", "yes", "1"} else "false"
    return value.strip()


def utc_timestamp() -> str:
    return datetime.utcnow().isoformat()
