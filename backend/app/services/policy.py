from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PolicyRule


@dataclass
class SuggestedRule:
    key: str
    value: float
    unit: str
    confidence: float
    source_excerpt: str


DEFAULT_RULES = [
    {
        "key": "approval_threshold",
        "name": "Approval Threshold",
        "category": "threshold",
        "threshold": 5000.0,
        "unit": "SAR",
        "weight": None,
    },
    {
        "key": "hotel_deviation_pct",
        "name": "Hotel Deviation Percentage",
        "category": "threshold",
        "threshold": 40.0,
        "unit": "pct",
        "weight": None,
    },
    {
        "key": "weekend_buffer_days",
        "name": "Weekend Buffer Days",
        "category": "threshold",
        "threshold": 2.0,
        "unit": "days",
        "weight": None,
    },
    {
        "key": "near_threshold_pct",
        "name": "Near Approval Threshold Percentage",
        "category": "threshold",
        "threshold": 98.0,
        "unit": "pct",
        "weight": None,
    },
    {
        "key": "approver_exception_threshold",
        "name": "Approver Exception Threshold",
        "category": "threshold",
        "threshold": 3.0,
        "unit": "count",
        "weight": None,
    },
    {
        "key": "risk_critical_min",
        "name": "Critical Risk Minimum",
        "category": "threshold",
        "threshold": 60.0,
        "unit": "score",
        "weight": None,
    },
    {
        "key": "mean_threshold_pct",
        "name": "Peer Mean Threshold Percentage",
        "category": "threshold",
        "threshold": 10.0,
        "unit": "pct",
        "weight": None,
    },
    {
        "key": "outlier_min_sample_size",
        "name": "Outlier Minimum Sample Size",
        "category": "system",
        "threshold": 8.0,
        "unit": "count",
        "weight": None,
    },
    {
        "key": "risk_detection_mode_code",
        "name": "Risk Detection Mode Code",
        "category": "system",
        "threshold": 2.0,
        "unit": "enum",
        "weight": None,
    },
    {"key": "weight_duplicate_receipt", "name": "Weight Duplicate Receipt", "category": "weight", "threshold": None, "unit": "score", "weight": 30.0},
    {"key": "weight_hotel_above_benchmark", "name": "Weight Hotel Above Benchmark", "category": "weight", "threshold": None, "unit": "score", "weight": 15.0},
    {"key": "weight_near_approval_threshold", "name": "Weight Near Approval Threshold", "category": "weight", "threshold": None, "unit": "score", "weight": 15.0},
    {"key": "weight_extended_stay", "name": "Weight Extended Stay", "category": "weight", "threshold": None, "unit": "score", "weight": 10.0},
    {"key": "weight_meal_double_claim", "name": "Weight Meal Double Claim", "category": "weight", "threshold": None, "unit": "score", "weight": 10.0},
    {"key": "weight_non_compliant_booking", "name": "Weight Non-Compliant Booking", "category": "weight", "threshold": None, "unit": "score", "weight": 10.0},
    {"key": "weight_business_class_travel", "name": "Weight Business Class Travel", "category": "weight", "threshold": None, "unit": "score", "weight": 10.0},
    {"key": "weight_overlapping_trips", "name": "Weight Overlapping Trips", "category": "weight", "threshold": None, "unit": "score", "weight": 25.0},
    {"key": "weight_vendor_concentration", "name": "Weight Vendor Concentration", "category": "weight", "threshold": None, "unit": "score", "weight": 10.0},
    {"key": "weight_approver_exception_pattern", "name": "Weight Approver Exception Pattern", "category": "weight", "threshold": None, "unit": "score", "weight": 15.0},
    {"key": "weight_amount_outlier_abnormality", "name": "Weight Amount Outlier Abnormality", "category": "weight", "threshold": None, "unit": "score", "weight": 22.0},
    {"key": "weight_trip_duration_outlier_abnormality", "name": "Weight Trip Duration Outlier Abnormality", "category": "weight", "threshold": None, "unit": "score", "weight": 12.0},
    {"key": "weight_amount_above_peer_mean_threshold", "name": "Weight Amount Above Peer Mean Threshold", "category": "weight", "threshold": None, "unit": "score", "weight": 16.0},
]


CITY_HOTEL_BENCHMARK_SAR = {
    "Riyadh": 650.0,
    "Jeddah": 600.0,
    "Dammam": 550.0,
    "Dubai": 850.0,
    "Abu Dhabi": 780.0,
    "London": 920.0,
    "Paris": 900.0,
    "Berlin": 760.0,
    "Singapore": 890.0,
    "New York": 980.0,
}


def seed_default_policies(db: Session) -> None:
    existing_keys = {row[0] for row in db.execute(select(PolicyRule.key)).all()}
    for spec in DEFAULT_RULES:
        if spec["key"] in existing_keys:
            continue
        db.add(
            PolicyRule(
                key=spec["key"],
                name=spec["name"],
                category=spec["category"],
                threshold=spec["threshold"],
                unit=spec["unit"],
                weight=spec["weight"],
                source="seed",
                enabled=True,
            )
        )
    db.commit()


def get_policy_map(db: Session) -> dict[str, PolicyRule]:
    rules = db.execute(select(PolicyRule).where(PolicyRule.enabled.is_(True))).scalars().all()
    return {rule.key: rule for rule in rules}


def get_rule_threshold(policy_map: dict[str, PolicyRule], key: str, default: float) -> float:
    rule = policy_map.get(key)
    if not rule or rule.threshold is None:
        return default
    return float(rule.threshold)


def get_detection_weight(policy_map: dict[str, PolicyRule], detection_type: str, default: float) -> float:
    key = f"weight_{detection_type}"
    rule = policy_map.get(key)
    if not rule or rule.weight is None:
        return default
    return float(rule.weight)


def get_city_benchmark(city: Optional[str]) -> Optional[float]:
    if not city:
        return None
    return CITY_HOTEL_BENCHMARK_SAR.get(city.title())


RISK_DETECTION_MODE_CODES = {
    "outlier": 0,
    "mean_threshold": 1,
    "combined": 2,
}


def get_risk_detection_mode(policy_map: dict[str, PolicyRule]) -> str:
    code = int(round(get_rule_threshold(policy_map, "risk_detection_mode_code", 2.0)))
    for mode, mode_code in RISK_DETECTION_MODE_CODES.items():
        if mode_code == code:
            return mode
    return "combined"


def risk_detection_mode_to_code(mode: str) -> int:
    return RISK_DETECTION_MODE_CODES.get(mode, 2)


def extract_rules_from_policy_text(text: str) -> list[SuggestedRule]:
    suggestions: list[SuggestedRule] = []

    hotel_pct = re.search(r"hotel\s+bookings?.{0,60}?not\s+exceed\s+(\d{1,3})\s*%", text, re.IGNORECASE | re.DOTALL)
    if hotel_pct:
        suggestions.append(
            SuggestedRule(
                key="hotel_deviation_pct",
                value=float(hotel_pct.group(1)),
                unit="pct",
                confidence=0.87,
                source_excerpt=hotel_pct.group(0)[:180],
            )
        )

    approval = re.search(r"(?:claims?|expenses?).{0,50}?(?:above|at or above|over)\s*(\d{3,7})\s*(SAR|USD|EUR|GBP)?", text, re.IGNORECASE | re.DOTALL)
    if approval:
        suggestions.append(
            SuggestedRule(
                key="approval_threshold",
                value=float(approval.group(1)),
                unit=approval.group(2) or "currency",
                confidence=0.8,
                source_excerpt=approval.group(0)[:180],
            )
        )

    near_pct = re.search(r"near[-\s]?threshold.{0,30}?(\d{2,3})\s*%", text, re.IGNORECASE | re.DOTALL)
    if near_pct:
        suggestions.append(
            SuggestedRule(
                key="near_threshold_pct",
                value=float(near_pct.group(1)),
                unit="pct",
                confidence=0.7,
                source_excerpt=near_pct.group(0)[:180],
            )
        )

    return suggestions
