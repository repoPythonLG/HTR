from __future__ import annotations

from dataclasses import dataclass
import math
from statistics import median
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models import Claim, ExtractedField, ReceiptDocument, ReviewerDecision
from app.services.policy import (
    get_city_benchmark,
    get_detection_weight,
    get_location_cost_factor,
    get_risk_detection_mode,
    get_rule_threshold,
)


@dataclass
class DetectionCandidate:
    detection_type: str
    reason: str
    supporting_facts: dict
    source_references: dict
    policy_reference: Optional[str]
    confidence_score: float
    recommended_action: str


def _to_float(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _field_values(document: ReceiptDocument, name: str) -> list[str]:
    return [f.normalized_value or f.value for f in document.extracted_fields if f.name == name]


def _collect_values(documents: list[ReceiptDocument], name: str) -> list[str]:
    values: list[str] = []
    for doc in documents:
        values.extend(_field_values(doc, name))
    return [value for value in values if value]


def _severity_from_weight(weight: float) -> str:
    if weight >= 25:
        return "Critical"
    if weight >= 15:
        return "High"
    if weight >= 10:
        return "Medium"
    return "Low"


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _std_dev(values: list[float], mean_value: float) -> float:
    if len(values) < 2:
        return 0.0
    variance = sum((value - mean_value) ** 2 for value in values) / (len(values) - 1)
    return math.sqrt(max(variance, 0.0))


def _percentile(sorted_values: list[float], percentile_value: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]

    position = (len(sorted_values) - 1) * percentile_value
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[int(position)]
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def _robust_z_score(value: float, median_value: float, median_abs_dev: float) -> float:
    if median_abs_dev <= 0:
        return 0.0
    return 0.6745 * (value - median_value) / median_abs_dev


def _claim_duration_days(claim: Claim) -> Optional[int]:
    if claim.trip_duration_days and claim.trip_duration_days > 0:
        return claim.trip_duration_days
    if claim.start_date and claim.end_date:
        return (claim.end_date - claim.start_date).days + 1
    return None


def _claim_destination_city(claim: Claim) -> Optional[str]:
    return claim.to_city or claim.destination_city


def _build_peer_groups(claim: Claim) -> list[tuple[str, list[tuple[str, str]]]]:
    groups: list[tuple[str, list[tuple[str, str]]]] = []
    destination_city = _claim_destination_city(claim)

    if claim.expense_type and claim.trip_boundary and claim.to_country and destination_city:
        groups.append(
            (
                "expense_type + boundary + country + city",
                [
                    ("expense_type", claim.expense_type),
                    ("trip_boundary", claim.trip_boundary),
                    ("to_country", claim.to_country),
                    ("destination_city", destination_city),
                ],
            )
        )

    if claim.expense_type and claim.trip_boundary and claim.to_country:
        groups.append(
            (
                "expense_type + boundary + country",
                [
                    ("expense_type", claim.expense_type),
                    ("trip_boundary", claim.trip_boundary),
                    ("to_country", claim.to_country),
                ],
            )
        )

    if claim.trip_boundary and claim.to_country:
        groups.append(
            (
                "boundary + country",
                [
                    ("trip_boundary", claim.trip_boundary),
                    ("to_country", claim.to_country),
                ],
            )
        )

    if claim.to_country:
        groups.append(("country", [("to_country", claim.to_country)]))

    if claim.expense_type and claim.trip_boundary and claim.trip_activity:
        groups.append(
            (
                "expense_type + boundary + activity",
                [
                    ("expense_type", claim.expense_type),
                    ("trip_boundary", claim.trip_boundary),
                    ("trip_activity", claim.trip_activity),
                ],
            )
        )

    if claim.expense_type and claim.trip_boundary:
        groups.append(
            (
                "expense_type + boundary",
                [
                    ("expense_type", claim.expense_type),
                    ("trip_boundary", claim.trip_boundary),
                ],
            )
        )

    if claim.trip_boundary:
        groups.append(("boundary", [("trip_boundary", claim.trip_boundary)]))

    groups.append(("global", []))
    return groups


def _peer_claims(
    db: Session,
    claim: Claim,
    minimum_samples: int,
) -> tuple[list[Claim], str]:
    groups = _build_peer_groups(claim)
    fallback_claims: list[Claim] = []
    fallback_label = "global"

    for label, filters in groups:
        stmt = select(Claim).where(Claim.claim_id != claim.claim_id, Claim.claim_total > 0)
        for field_name, value in filters:
            stmt = stmt.where(getattr(Claim, field_name) == value)
        rows = db.execute(stmt.order_by(Claim.created_at.desc()).limit(5000)).scalars().all()
        if len(rows) >= minimum_samples:
            return rows, label
        if len(rows) > len(fallback_claims):
            fallback_claims = rows
            fallback_label = label

    return fallback_claims, fallback_label


def evaluate_claim(db: Session, claim: Claim, documents: list[ReceiptDocument], policy_map: dict) -> tuple[list[dict], dict]:
    candidates: list[DetectionCandidate] = []
    detection_mode = get_risk_detection_mode(policy_map)
    mean_threshold_pct = max(0.0, get_rule_threshold(policy_map, "mean_threshold_pct", 10.0))
    location_adjusted_threshold_pct = max(
        0.0,
        get_rule_threshold(policy_map, "location_adjusted_threshold_pct", max(12.0, mean_threshold_pct)),
    )
    outlier_min_sample = int(max(3.0, get_rule_threshold(policy_map, "outlier_min_sample_size", 8.0)))

    receipt_ids = list(set(_collect_values(documents, "receipt_number")))
    if receipt_ids:
        duplicate_stmt = (
            select(ExtractedField.normalized_value, ReceiptDocument.claim_id, ReceiptDocument.document_id)
            .join(ReceiptDocument, ReceiptDocument.document_id == ExtractedField.document_id)
            .where(
                ExtractedField.name == "receipt_number",
                ExtractedField.normalized_value.in_(receipt_ids),
                ReceiptDocument.claim_id != claim.claim_id,
            )
        )
        duplicate_hits = db.execute(duplicate_stmt).all()
        if duplicate_hits:
            candidates.append(
                DetectionCandidate(
                    detection_type="duplicate_receipt",
                    reason="Entry identifier appears in another travel expense entry, suggesting duplicate submission.",
                    supporting_facts={
                        "receipt_numbers": receipt_ids,
                        "related_claims": list({row.claim_id for row in duplicate_hits}),
                    },
                    source_references={"related_document_ids": list({row.document_id for row in duplicate_hits})},
                    policy_reference="duplicate_receipt_check",
                    confidence_score=0.92,
                    recommended_action="Validate original entry",
                )
            )

    city = claim.destination_city
    room_rates = [_to_float(value) for value in _collect_values(documents, "room_rate")]
    room_rates = [value for value in room_rates if value is not None]
    if room_rates:
        benchmark = get_city_benchmark(city)
        if benchmark is not None:
            deviation_pct = get_rule_threshold(policy_map, "hotel_deviation_pct", 40.0)
            max_allowed = benchmark * (1 + deviation_pct / 100.0)
            observed = max(room_rates)
            if observed > max_allowed:
                candidates.append(
                    DetectionCandidate(
                        detection_type="hotel_above_benchmark",
                        reason="Accommodation rate exceeds the policy benchmark threshold for the destination city.",
                        supporting_facts={
                            "city": city,
                            "observed_room_rate": observed,
                            "city_benchmark": benchmark,
                            "allowed_with_deviation": round(max_allowed, 2),
                            "allowed_deviation_pct": deviation_pct,
                        },
                        source_references={"document_types": [doc.document_type for doc in documents]},
                        policy_reference="hotel_deviation_pct",
                        confidence_score=0.84,
                        recommended_action="Review or escalate",
                    )
                )

    approval_threshold = get_rule_threshold(policy_map, "approval_threshold", 5000.0)
    near_threshold_pct = get_rule_threshold(policy_map, "near_threshold_pct", 98.0)
    near_floor = approval_threshold * (near_threshold_pct / 100.0)
    if near_floor <= claim.claim_total < approval_threshold:
        candidates.append(
            DetectionCandidate(
                detection_type="near_approval_threshold",
                reason="Travel expense entry total is just below the extra-approval threshold.",
                supporting_facts={
                    "claim_total": claim.claim_total,
                    "approval_threshold": approval_threshold,
                    "near_threshold_floor": round(near_floor, 2),
                },
                source_references={"claim_id": claim.claim_id},
                policy_reference="approval_threshold",
                confidence_score=0.98,
                recommended_action="Review",
            )
        )

    if claim.start_date and claim.end_date:
        stay_days = (claim.end_date - claim.start_date).days + 1
        weekend_buffer = int(get_rule_threshold(policy_map, "weekend_buffer_days", 2.0))
        if stay_days > 7 + weekend_buffer:
            candidates.append(
                DetectionCandidate(
                    detection_type="extended_stay",
                    reason="Trip duration exceeds expected business travel window plus allowed buffer.",
                    supporting_facts={"stay_days": stay_days, "allowed_days": 7 + weekend_buffer},
                    source_references={"claim_window": [claim.start_date.isoformat(), claim.end_date.isoformat()]},
                    policy_reference="weekend_buffer_days",
                    confidence_score=0.79,
                    recommended_action="Request clarification",
                )
            )

    has_meal_doc = any(doc.document_type == "meal" for doc in documents)
    meal_included = any(value == "true" for value in _collect_values(documents, "meal_included"))
    if has_meal_doc and meal_included:
        candidates.append(
            DetectionCandidate(
                detection_type="meal_double_claim",
                reason="Meal expense entry submitted while supporting evidence indicates meals are already included.",
                supporting_facts={"meal_receipt_present": True, "hotel_meal_included_indicator": True},
                source_references={"document_types": [doc.document_type for doc in documents]},
                policy_reference="meal_double_claim_policy",
                confidence_score=0.81,
                recommended_action="Request clarification",
            )
        )

    booking_channels = [value.lower() for value in _collect_values(documents, "booking_channel")]
    if any("non_compliant" in value for value in booking_channels):
        candidates.append(
            DetectionCandidate(
                detection_type="non_compliant_booking",
                reason="Booking channel appears to be marked as non-compliant with policy.",
                supporting_facts={"booking_channels": booking_channels},
                source_references={"field": "booking_channel"},
                policy_reference="booking_compliance_rule",
                confidence_score=0.72,
                recommended_action="Review",
            )
        )

    flight_classes = [value.lower() for value in _collect_values(documents, "flight_class")]
    if any("business" in value or "first" in value for value in flight_classes):
        candidates.append(
            DetectionCandidate(
                detection_type="business_class_travel",
                reason="Flight evidence indicates business/first class travel requiring exception validation.",
                supporting_facts={"flight_classes": flight_classes},
                source_references={"field": "flight_class"},
                policy_reference="travel_class_policy",
                confidence_score=0.9,
                recommended_action="Exception validation",
            )
        )

    if claim.start_date and claim.end_date:
        overlap_stmt = (
            select(Claim.claim_id, Claim.start_date, Claim.end_date)
            .where(
                Claim.employee_id == claim.employee_id,
                Claim.claim_id != claim.claim_id,
                Claim.start_date.is_not(None),
                Claim.end_date.is_not(None),
                and_(Claim.start_date <= claim.end_date, Claim.end_date >= claim.start_date),
            )
            .limit(10)
        )
        overlaps = db.execute(overlap_stmt).all()
        if overlaps:
            candidates.append(
                DetectionCandidate(
                    detection_type="overlapping_trips",
                    reason="Trip dates overlap with another travel expense entry from the same employee.",
                    supporting_facts={"overlapping_claim_ids": [row.claim_id for row in overlaps]},
                    source_references={"employee_id": claim.employee_id},
                    policy_reference="trip_overlap_rule",
                    confidence_score=0.88,
                    recommended_action="Escalate",
                )
            )

    merchant_stmt = (
        select(ExtractedField.normalized_value, func.count())
        .join(ReceiptDocument, ReceiptDocument.document_id == ExtractedField.document_id)
        .join(Claim, Claim.claim_id == ReceiptDocument.claim_id)
        .where(Claim.employee_id == claim.employee_id, ExtractedField.name == "merchant")
        .group_by(ExtractedField.normalized_value)
    )
    merchant_counts = db.execute(merchant_stmt).all()
    total_merchant_rows = sum(row[1] for row in merchant_counts)
    current_merchants = set(_collect_values(documents, "merchant"))
    if total_merchant_rows >= 4 and merchant_counts:
        top_vendor, top_count = max(merchant_counts, key=lambda row: row[1])
        ratio = top_count / total_merchant_rows
        if ratio >= 0.6 and top_vendor in current_merchants:
            candidates.append(
                DetectionCandidate(
                    detection_type="vendor_concentration",
                    reason="A single vendor dominates this employee's reimbursement history.",
                    supporting_facts={"vendor": top_vendor, "vendor_share": round(ratio, 2), "sample_size": total_merchant_rows},
                    source_references={"employee_id": claim.employee_id},
                    policy_reference="vendor_concentration_rule",
                    confidence_score=0.76,
                    recommended_action="Audit investigation",
                )
            )

    exception_limit = int(get_rule_threshold(policy_map, "approver_exception_threshold", 3.0))
    exception_stmt = (
        select(ReviewerDecision.reviewer_id, func.count())
        .where(ReviewerDecision.disposition_reason == "approved_exception")
        .group_by(ReviewerDecision.reviewer_id)
        .having(func.count() >= exception_limit)
    )
    frequent_exception_reviewers = db.execute(exception_stmt).all()
    if frequent_exception_reviewers:
        candidates.append(
            DetectionCandidate(
                detection_type="approver_exception_pattern",
                reason="At least one reviewer has a repeated approved-exception pattern over the policy threshold.",
                supporting_facts={
                    "threshold": exception_limit,
                    "reviewers": [{"reviewer_id": row[0], "approved_exceptions": row[1]} for row in frequent_exception_reviewers],
                },
                source_references={"entity": "reviewer_decisions"},
                policy_reference="approver_exception_threshold",
                confidence_score=0.73,
                recommended_action="Audit investigation",
            )
        )

    peer_claims, peer_group = _peer_claims(db, claim, outlier_min_sample)
    peer_amounts = [float(item.claim_total) for item in peer_claims if item.claim_total and item.claim_total > 0]
    current_location_factor = get_location_cost_factor(
        country=claim.to_country,
        city=_claim_destination_city(claim),
        trip_boundary=claim.trip_boundary,
    )
    normalized_peer_amounts: list[float] = []
    peer_location_factors: list[float] = []
    for item in peer_claims:
        if not item.claim_total or item.claim_total <= 0:
            continue
        item_factor = get_location_cost_factor(
            country=item.to_country,
            city=_claim_destination_city(item),
            trip_boundary=item.trip_boundary,
        )
        normalized_peer_amounts.append(float(item.claim_total) / item_factor)
        peer_location_factors.append(item_factor)

    use_outlier_detection = detection_mode in {"outlier", "combined"}
    use_mean_threshold = detection_mode in {"mean_threshold", "combined"}

    if use_outlier_detection and len(peer_amounts) >= outlier_min_sample:
        sorted_amounts = sorted(peer_amounts)
        mean_amount = _mean(peer_amounts)
        std_amount = _std_dev(peer_amounts, mean_amount)
        median_amount = median(sorted_amounts)
        median_abs_dev = median([abs(value - median_amount) for value in sorted_amounts]) if sorted_amounts else 0.0
        q1 = _percentile(sorted_amounts, 0.25)
        q3 = _percentile(sorted_amounts, 0.75)
        iqr = max(0.0, q3 - q1)
        upper_iqr = q3 + (1.5 * iqr)
        z_score = (claim.claim_total - mean_amount) / std_amount if std_amount > 0 else 0.0
        robust_z = _robust_z_score(claim.claim_total, median_amount, median_abs_dev)

        is_outlier = (
            abs(z_score) >= 3.0
            or abs(robust_z) >= 3.5
            or (iqr > 0 and claim.claim_total > upper_iqr)
        )
        if is_outlier:
            candidates.append(
                DetectionCandidate(
                    detection_type="amount_outlier_abnormality",
                    reason="Travel expense entry amount is statistically outside the normal peer distribution for similar trips.",
                    supporting_facts={
                        "claim_amount": round(claim.claim_total, 2),
                        "peer_group": peer_group,
                        "peer_sample_size": len(peer_amounts),
                        "peer_mean": round(mean_amount, 2),
                        "peer_median": round(median_amount, 2),
                        "peer_std_dev": round(std_amount, 2),
                        "iqr_upper_bound": round(upper_iqr, 2),
                        "z_score": round(z_score, 3),
                        "robust_z_score": round(robust_z, 3),
                    },
                    source_references={"entity": "travel expense entries"},
                    policy_reference="outlier_min_sample_size",
                    confidence_score=0.86,
                    recommended_action="Review and request justification",
                )
            )

        current_duration = _claim_duration_days(claim)
        peer_durations = [_claim_duration_days(item) for item in peer_claims]
        peer_duration_values = [float(value) for value in peer_durations if value and value > 0]
        if current_duration and len(peer_duration_values) >= outlier_min_sample:
            sorted_durations = sorted(peer_duration_values)
            duration_median = median(sorted_durations)
            duration_mad = median([abs(value - duration_median) for value in sorted_durations]) if sorted_durations else 0.0
            duration_q1 = _percentile(sorted_durations, 0.25)
            duration_q3 = _percentile(sorted_durations, 0.75)
            duration_iqr = max(0.0, duration_q3 - duration_q1)
            duration_upper = duration_q3 + (1.5 * duration_iqr)
            duration_robust_z = _robust_z_score(float(current_duration), duration_median, duration_mad)
            duration_is_outlier = abs(duration_robust_z) >= 3.5 or (
                duration_iqr > 0 and float(current_duration) > duration_upper
            )
            if duration_is_outlier:
                candidates.append(
                    DetectionCandidate(
                        detection_type="trip_duration_outlier_abnormality",
                        reason="Trip duration is outside the normal duration pattern for peer travel expense entries.",
                        supporting_facts={
                            "trip_duration_days": current_duration,
                            "peer_group": peer_group,
                            "peer_sample_size": len(peer_duration_values),
                            "peer_median_duration": round(duration_median, 2),
                            "peer_duration_iqr_upper": round(duration_upper, 2),
                            "robust_z_score": round(duration_robust_z, 3),
                        },
                        source_references={"entity": "travel expense entries"},
                        policy_reference="outlier_min_sample_size",
                        confidence_score=0.8,
                        recommended_action="Review travel details",
                    )
                )

    if use_mean_threshold and len(peer_amounts) >= 3:
        mean_amount = _mean(peer_amounts)
        threshold_value = mean_amount * (1 + (mean_threshold_pct / 100.0))
        if claim.claim_total > threshold_value:
            uplift_pct = ((claim.claim_total - mean_amount) / mean_amount * 100.0) if mean_amount > 0 else 0.0
            candidates.append(
                DetectionCandidate(
                    detection_type="amount_above_peer_mean_threshold",
                    reason="Travel expense entry amount exceeds the configured threshold above the peer mean.",
                    supporting_facts={
                        "claim_amount": round(claim.claim_total, 2),
                        "peer_group": peer_group,
                        "peer_sample_size": len(peer_amounts),
                        "peer_mean": round(mean_amount, 2),
                        "configured_threshold_pct": round(mean_threshold_pct, 2),
                        "threshold_amount": round(threshold_value, 2),
                        "uplift_vs_mean_pct": round(uplift_pct, 2),
                    },
                    source_references={"entity": "travel expense entries"},
                    policy_reference="mean_threshold_pct",
                    confidence_score=0.88,
                    recommended_action="Review variance and supporting evidence",
                )
            )

    if use_mean_threshold and len(normalized_peer_amounts) >= 3:
        normalized_mean_amount = _mean(normalized_peer_amounts)
        normalized_threshold_value = normalized_mean_amount * (1 + (location_adjusted_threshold_pct / 100.0))
        normalized_claim_amount = float(claim.claim_total) / current_location_factor

        if normalized_claim_amount > normalized_threshold_value:
            uplift_pct = (
                (normalized_claim_amount - normalized_mean_amount) / normalized_mean_amount * 100.0
            ) if normalized_mean_amount > 0 else 0.0
            candidates.append(
                DetectionCandidate(
                    detection_type="location_cost_anomaly",
                    reason="Travel expense entry amount exceeds the location-adjusted peer expectation for destination city/country.",
                    supporting_facts={
                        "claim_amount": round(claim.claim_total, 2),
                        "destination_country": claim.to_country,
                        "destination_city": _claim_destination_city(claim),
                        "trip_boundary": claim.trip_boundary,
                        "location_cost_factor": round(current_location_factor, 3),
                        "location_adjusted_claim_amount": round(normalized_claim_amount, 2),
                        "peer_group": peer_group,
                        "peer_sample_size": len(normalized_peer_amounts),
                        "peer_mean_location_adjusted_amount": round(normalized_mean_amount, 2),
                        "peer_avg_location_factor": round(_mean(peer_location_factors), 3) if peer_location_factors else 0.0,
                        "configured_location_threshold_pct": round(location_adjusted_threshold_pct, 2),
                        "location_adjusted_threshold_amount": round(normalized_threshold_value, 2),
                        "uplift_vs_location_adjusted_mean_pct": round(uplift_pct, 2),
                    },
                    source_references={"entity": "travel expense entries"},
                    policy_reference="location_adjusted_threshold_pct",
                    confidence_score=0.87,
                    recommended_action="Review amount relative to destination cost index",
                )
            )

    detections: list[dict] = []
    contributions: list[dict] = []
    for candidate in candidates:
        weight = get_detection_weight(policy_map, candidate.detection_type, default=10.0)
        severity = _severity_from_weight(weight)
        detections.append(
            {
                "detection_type": candidate.detection_type,
                "severity": severity,
                "human_readable_reason": candidate.reason,
                "supporting_facts": candidate.supporting_facts,
                "source_references": candidate.source_references,
                "policy_reference": candidate.policy_reference,
                "confidence_score": candidate.confidence_score,
                "recommended_action": candidate.recommended_action,
                "risk_weight": weight,
            }
        )
        contributions.append(
            {
                "detection_type": candidate.detection_type,
                "weight": weight,
                "severity": severity,
            }
        )

    risk_score = float(sum(item["weight"] for item in contributions))
    critical_min = get_rule_threshold(policy_map, "risk_critical_min", 60.0)
    if risk_score >= critical_min:
        risk_level = "Critical"
    elif risk_score >= 40:
        risk_level = "High"
    elif risk_score >= 20:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    primary_red_flag = None
    if contributions:
        primary_red_flag = max(contributions, key=lambda item: item["weight"])["detection_type"]

    risk = {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "primary_red_flag": primary_red_flag,
        "contributions": contributions,
    }
    return detections, risk
