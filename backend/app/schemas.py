from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    user_id: str
    username: str
    full_name: str
    role: str
    employee_code: Optional[str]
    is_active: bool

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str
    username: str
    role: str


class ExtractedFieldOut(BaseModel):
    field_id: str
    name: str
    value: str
    normalized_value: Optional[str]
    confidence: float
    page_no: int
    bbox: Optional[Dict[str, Any]]

    model_config = {"from_attributes": True}


class DocumentOut(BaseModel):
    document_id: str
    file_name: str
    mime_type: str
    page_count: int
    image_hash: str
    document_type: str
    extracted_text: Optional[str]
    created_at: datetime
    extracted_fields: List[ExtractedFieldOut] = []

    model_config = {"from_attributes": True}


class DetectionOut(BaseModel):
    detection_id: str
    detection_type: str
    severity: str
    human_readable_reason: str
    supporting_facts: Dict[str, Any]
    source_references: Dict[str, Any]
    policy_reference: Optional[str]
    confidence_score: float
    recommended_action: str
    risk_weight: float

    model_config = {"from_attributes": True}


class RiskAssessmentOut(BaseModel):
    risk_score: float
    risk_level: str
    primary_red_flag: Optional[str]
    generated_at: datetime
    model_version: str
    contributions: List[Dict[str, Any]]

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class ReviewerDecisionOut(BaseModel):
    decision_id: str
    reviewer_id: str
    status: str
    notes: Optional[str]
    disposition_reason: Optional[str]
    timestamp: datetime

    model_config = {"from_attributes": True}


class ClaimSummaryOut(BaseModel):
    claim_id: str
    employee_id: str
    employee_name: str
    department: str
    trip_number: Optional[str] = None
    trip_activity: Optional[str] = None
    trip_boundary: Optional[str] = None
    expense_type: Optional[str] = None
    to_country: Optional[str] = None
    masked_id: Optional[str] = None
    trip_duration_days: Optional[int] = None
    destination_city: Optional[str]
    claim_total: float
    currency: str
    status: str
    created_at: datetime
    source_type: str
    suspicious_flag: bool
    incorrect_flag: bool
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None
    primary_red_flag: Optional[str] = None
    detection_count: int = 0

    model_config = {"from_attributes": True}


class ClaimDetailOut(BaseModel):
    claim_id: str
    employee_id: str
    employee_name: str
    department: str
    trip_number: Optional[str]
    from_region: Optional[str]
    from_country: Optional[str]
    from_city: Optional[str]
    to_region: Optional[str]
    to_country: Optional[str]
    to_city: Optional[str]
    trip_activity: Optional[str]
    trip_boundary: Optional[str]
    expense_type: Optional[str]
    masked_id: Optional[str]
    trip_duration_days: Optional[int]
    start_date: Optional[date]
    end_date: Optional[date]
    trip_settlement_date: Optional[date]
    destination_city: Optional[str]
    claim_total: float
    currency: str
    status: str
    source_type: str
    source_reference: Optional[str]
    suspicious_flag: bool
    incorrect_flag: bool
    risk_score_cached: float
    created_at: datetime
    updated_at: datetime
    documents: List[DocumentOut]
    detections: List[DetectionOut]
    risk_assessment: Optional[RiskAssessmentOut]
    reviewer_decisions: List[ReviewerDecisionOut]

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    claim_id: str
    status: str
    document_count: int


class ExcelImportResponse(BaseModel):
    imported_claims: int
    analyzed_claims: int
    skipped_rows: int
    errors: List[str]
    claim_ids: List[str]


class ActiveImportOut(BaseModel):
    file_name: str
    uploaded_at: datetime
    uploaded_by: Optional[str] = None
    row_count: int
    analyzed_count: int
    error_count: int
    file_path: Optional[str] = None


class SpreadsheetPreviewOut(BaseModel):
    file_name: str
    columns: List[str]
    rows: List[List[str]]
    total_rows: int


class AnalyzeResponse(BaseModel):
    claim_id: str
    status: str
    detection_count: int
    risk_score: float
    risk_level: str


class ReviewActionIn(BaseModel):
    reviewer_id: str = Field(min_length=1)
    status: str = Field(min_length=1)
    notes: Optional[str] = None
    disposition_reason: Optional[str] = None


class PolicyRuleIn(BaseModel):
    key: str
    name: str
    category: str = "general"
    threshold: Optional[float] = None
    unit: Optional[str] = None
    weight: Optional[float] = None
    enabled: bool = True
    source: str = "manual"


class PolicyRuleOut(BaseModel):
    rule_id: str
    key: str
    name: str
    category: str
    threshold: Optional[float]
    unit: Optional[str]
    weight: Optional[float]
    enabled: bool
    source: str

    model_config = {"from_attributes": True}


class RiskSettingsIn(BaseModel):
    detection_mode: str = Field(pattern="^(outlier|mean_threshold|combined)$")
    mean_threshold_pct: float = Field(ge=0, le=500)
    outlier_min_sample_size: int = Field(ge=3, le=500)
    location_adjusted_threshold_pct: float = Field(ge=0, le=500)


class RiskSettingsOut(BaseModel):
    detection_mode: str
    mean_threshold_pct: float
    outlier_min_sample_size: int
    location_adjusted_threshold_pct: float


class ExtractedPolicySuggestion(BaseModel):
    key: str
    value: float
    unit: str
    confidence: float
    source_excerpt: str


class PolicyExtractionResponse(BaseModel):
    suggestions: List[ExtractedPolicySuggestion]


class ExecutiveDashboardOut(BaseModel):
    total_claims: int
    analyzed_claims: int
    suspicious_claims: int
    wrong_claims: int
    suspicious_rate_pct: float
    wrong_claim_rate_pct: float
    by_risk_level: Dict[str, int]
    by_department: Dict[str, int]
    top_detection_types: List[Dict[str, Any]]


class EmployeeRiskProfileOut(BaseModel):
    employee_id: str
    employee_name: str
    department: str
    total_claims: int
    analyzed_claims: int
    suspicious_claims: int
    incorrect_claims: int
    flagged_claims: int
    suspicious_rate_pct: float
    incorrect_rate_pct: float
    violation_rate_pct: float
    total_spend: float
    avg_claim_amount: float
    total_trip_days: int
    avg_trip_duration_days: float
    avg_cost_per_trip_day: float
    avg_risk_score: float
    max_risk_score: float
    risk_index: float
    employee_risk_level: str
    total_detections: int
    top_detection_type: Optional[str]
    top_detection_count: int
    domestic_trips: int
    international_trips: int
    top_destination_city: Optional[str]
    last_claim_at: Optional[datetime]


class EmployeeRiskDashboardOut(BaseModel):
    total_employees: int
    total_claims: int
    analyzed_claims: int
    suspicious_claims: int
    incorrect_claims: int
    flagged_claims: int
    total_spend: float
    avg_claim_amount: float
    avg_claims_per_employee: float
    avg_trip_duration_days: float
    high_risk_employees: int
    risk_band_distribution: Dict[str, int]
    employees: List[EmployeeRiskProfileOut]


class EmployeeDashboardOut(BaseModel):
    employee_id: str
    total_claims: int
    pending_claims: int
    analyzed_claims: int
    suspicious_claims: int
    recent_claims: List[ClaimSummaryOut]


class AnalysisFindingOut(BaseModel):
    detection_type: str
    severity: str
    reason: str
    policy_reference: Optional[str]
    recommended_action: str
    risk_weight: float


class ClaimAnalysisOut(BaseModel):
    claim_id: str
    employee_name: str
    risk_level: str
    risk_score: float
    suspicious_flag: bool
    incorrect_flag: bool
    primary_red_flag: Optional[str]
    findings: List[AnalysisFindingOut]
    evidence_summary: List[Dict[str, Any]]
    recommendations: List[str]


class OutlierMetricOptionOut(BaseModel):
    key: str
    label: str


class OutlierMapPointOut(BaseModel):
    claim_id: str
    employee_id: str
    employee_name: str
    department: str
    to_country: Optional[str]
    to_city: Optional[str]
    location_cost_factor: float
    x_value: float
    y_value: float
    x_zscore: float
    y_zscore: float
    distance_score: float
    cluster_id: int
    outlier_flag: bool
    outlier_reasons: List[str]
    suspicious_flag: bool
    incorrect_flag: bool
    risk_level: Optional[str]
    risk_score: Optional[float]
    detection_count: int


class OutlierClusterSummaryOut(BaseModel):
    cluster_id: int
    label: str
    point_count: int
    centroid_x: float
    centroid_y: float


class OutlierMapDashboardOut(BaseModel):
    x_metric: str
    y_metric: str
    x_label: str
    y_label: str
    total_points: int
    outlier_points: int
    metric_options: List[OutlierMetricOptionOut]
    clusters: List[OutlierClusterSummaryOut]
    points: List[OutlierMapPointOut]
