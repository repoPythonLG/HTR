export type UserRole = 'employee' | 'reviewer' | 'administrator'

export type AuthToken = {
  access_token: string
  token_type: string
  username: string
  role: UserRole
}

export type CurrentUser = {
  user_id: string
  username: string
  full_name: string
  role: UserRole
  employee_code?: string | null
  is_active: boolean
}

export type ClaimSummary = {
  claim_id: string
  employee_id: string
  employee_name: string
  department: string
  trip_number?: string | null
  trip_activity?: string | null
  trip_boundary?: string | null
  expense_type?: string | null
  to_country?: string | null
  masked_id?: string | null
  trip_duration_days?: number | null
  destination_city?: string | null
  claim_total: number
  currency: string
  status: string
  created_at: string
  source_type: string
  suspicious_flag: boolean
  incorrect_flag: boolean
  risk_level?: string | null
  risk_score?: number | null
  primary_red_flag?: string | null
  detection_count: number
}

export type ExtractedField = {
  field_id: string
  name: string
  value: string
  normalized_value?: string | null
  confidence: number
  page_no: number
}

export type DocumentRecord = {
  document_id: string
  file_name: string
  mime_type: string
  page_count: number
  image_hash: string
  document_type: string
  extracted_text?: string | null
  created_at: string
  extracted_fields: ExtractedField[]
}

export type Detection = {
  detection_id: string
  detection_type: string
  severity: string
  human_readable_reason: string
  supporting_facts: Record<string, unknown>
  source_references: Record<string, unknown>
  policy_reference?: string | null
  confidence_score: number
  recommended_action: string
  risk_weight: number
}

export type RiskAssessment = {
  risk_score: number
  risk_level: string
  primary_red_flag?: string | null
  generated_at: string
  model_version: string
  contributions: Array<{
    detection_type: string
    weight: number
    severity: string
  }>
}

export type ReviewerDecision = {
  decision_id: string
  reviewer_id: string
  status: string
  notes?: string | null
  disposition_reason?: string | null
  timestamp: string
}

export type ClaimDetail = {
  claim_id: string
  employee_id: string
  employee_name: string
  department: string
  trip_number?: string | null
  from_region?: string | null
  from_country?: string | null
  from_city?: string | null
  to_region?: string | null
  to_country?: string | null
  to_city?: string | null
  trip_activity?: string | null
  trip_boundary?: string | null
  expense_type?: string | null
  masked_id?: string | null
  trip_duration_days?: number | null
  start_date?: string | null
  end_date?: string | null
  trip_settlement_date?: string | null
  destination_city?: string | null
  claim_total: number
  currency: string
  status: string
  source_type: string
  source_reference?: string | null
  suspicious_flag: boolean
  incorrect_flag: boolean
  risk_score_cached: number
  created_at: string
  updated_at: string
  documents: DocumentRecord[]
  detections: Detection[]
  risk_assessment?: RiskAssessment | null
  reviewer_decisions: ReviewerDecision[]
}

export type ExecutiveDashboard = {
  total_claims: number
  analyzed_claims: number
  suspicious_claims: number
  wrong_claims: number
  suspicious_rate_pct: number
  wrong_claim_rate_pct: number
  by_risk_level: Record<string, number>
  by_department: Record<string, number>
  top_detection_types: Array<{
    detection_type: string
    count: number
  }>
}

export type EmployeeRiskProfile = {
  employee_id: string
  employee_name: string
  department: string
  total_claims: number
  analyzed_claims: number
  suspicious_claims: number
  incorrect_claims: number
  flagged_claims: number
  suspicious_rate_pct: number
  incorrect_rate_pct: number
  violation_rate_pct: number
  total_spend: number
  avg_claim_amount: number
  total_trip_days: number
  avg_trip_duration_days: number
  avg_cost_per_trip_day: number
  avg_risk_score: number
  max_risk_score: number
  risk_index: number
  employee_risk_level: string
  total_detections: number
  top_detection_type?: string | null
  top_detection_count: number
  domestic_trips: number
  international_trips: number
  top_destination_city?: string | null
  last_claim_at?: string | null
}

export type EmployeeRiskDashboard = {
  total_employees: number
  total_claims: number
  analyzed_claims: number
  suspicious_claims: number
  incorrect_claims: number
  flagged_claims: number
  total_spend: number
  avg_claim_amount: number
  avg_claims_per_employee: number
  avg_trip_duration_days: number
  high_risk_employees: number
  risk_band_distribution: Record<string, number>
  employees: EmployeeRiskProfile[]
}

export type EmployeeDashboard = {
  employee_id: string
  total_claims: number
  pending_claims: number
  analyzed_claims: number
  suspicious_claims: number
  recent_claims: ClaimSummary[]
}

export type ClaimAnalysis = {
  claim_id: string
  employee_name: string
  risk_level: string
  risk_score: number
  suspicious_flag: boolean
  incorrect_flag: boolean
  primary_red_flag?: string | null
  findings: Array<{
    detection_type: string
    severity: string
    reason: string
    policy_reference?: string | null
    recommended_action: string
    risk_weight: number
  }>
  evidence_summary: Array<{
    detection_type: string
    supporting_facts: Record<string, unknown>
    source_references: Record<string, unknown>
  }>
  recommendations: string[]
}

export type ExcelImportResult = {
  imported_claims: number
  analyzed_claims: number
  skipped_rows: number
  errors: string[]
  claim_ids: string[]
}

export type ActiveImport = {
  file_name: string
  uploaded_at: string
  uploaded_by?: string | null
  row_count: number
  analyzed_count: number
  error_count: number
  file_path?: string | null
}

export type SpreadsheetPreview = {
  file_name: string
  columns: string[]
  rows: string[][]
  total_rows: number
}

export type PolicyRule = {
  rule_id: string
  key: string
  name: string
  category: string
  threshold?: number | null
  unit?: string | null
  weight?: number | null
  enabled: boolean
  source: string
}

export type RiskSettings = {
  detection_mode: 'outlier' | 'mean_threshold' | 'combined'
  mean_threshold_pct: number
  outlier_min_sample_size: number
}
