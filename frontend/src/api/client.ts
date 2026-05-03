import axios from 'axios'
import {
  CaseManagement,
  CaseManagementPayload,
  CaseTimeline,
  ClaimListResponse,
  ClaimChatDebugResponse,
  ClaimChatMessage,
  ClaimChatResponse,
  ClaimAnalysis,
  ClaimDetail,
  ClaimSummary,
  CurrentUser,
  DocumentRecord,
  OutlierMapDashboard,
  EmployeeDashboard,
  EmployeeRiskDashboard,
  ExcelImportResult,
  ExecutiveDashboard,
  ActiveImport,
  ModelGovernance,
  PolicyRule,
  RiskSettings,
  SpreadsheetPreview,
  UserRole
} from '../types'

const DEMO_ROLE_KEY = 'sabic_travel_expenses_demo_role'
const DEMO_ROLES: UserRole[] = ['employee', 'reviewer', 'administrator']

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api/v1'
})

api.interceptors.request.use((config) => {
  config.headers['X-Demo-Role'] = getStoredDemoRole()
  return config
})

export function getStoredDemoRole(): UserRole {
  const stored = window.localStorage.getItem(DEMO_ROLE_KEY)
  return DEMO_ROLES.includes(stored as UserRole) ? (stored as UserRole) : 'reviewer'
}

export function setStoredDemoRole(role: UserRole) {
  window.localStorage.setItem(DEMO_ROLE_KEY, role)
}

function withReceiptAliases<T extends { claim_id: string; claim_total: number }>(row: T): T & {
  receipt_id: string
  receipt_total: number
} {
  return {
    ...row,
    receipt_id: row.claim_id,
    receipt_total: row.claim_total
  }
}

function withAnalysisAliases<T extends { claim_id: string }>(row: T): T & { receipt_id: string } {
  return {
    ...row,
    receipt_id: row.claim_id
  }
}

function withExecutiveAliases(data: ExecutiveDashboard): ExecutiveDashboard {
  return {
    ...data,
    total_receipts: data.total_claims,
    analyzed_receipts: data.analyzed_claims,
    suspicious_receipts: data.suspicious_claims,
    wrong_receipts: data.wrong_claims,
    wrong_receipt_rate_pct: data.wrong_claim_rate_pct
  }
}

function withEmployeeDashboardAliases(data: EmployeeDashboard): EmployeeDashboard {
  return {
    ...data,
    total_receipts: data.total_claims,
    pending_receipts: data.pending_claims,
    analyzed_receipts: data.analyzed_claims,
    suspicious_receipts: data.suspicious_claims,
    recent_receipts: data.recent_claims.map(withReceiptAliases)
  }
}

function withEmployeeRiskAliases(data: EmployeeRiskDashboard): EmployeeRiskDashboard {
  const employees = data.employees.map((employee) => ({
    ...employee,
    total_receipts: employee.total_claims,
    analyzed_receipts: employee.analyzed_claims,
    suspicious_receipts: employee.suspicious_claims,
    incorrect_receipts: employee.incorrect_claims,
    flagged_receipts: employee.flagged_claims,
    avg_receipt_amount: employee.avg_claim_amount,
    last_receipt_at: employee.last_claim_at
  }))

  return {
    ...data,
    total_receipts: data.total_claims,
    analyzed_receipts: data.analyzed_claims,
    suspicious_receipts: data.suspicious_claims,
    incorrect_receipts: data.incorrect_claims,
    flagged_receipts: data.flagged_claims,
    avg_receipt_amount: data.avg_claim_amount,
    avg_receipts_per_employee: data.avg_claims_per_employee,
    employees
  }
}

function toApiMetric(metric?: string) {
  if (metric === 'receipt_total') return 'claim_total'
  if (metric === 'location_adjusted_receipt_total') return 'location_adjusted_claim_total'
  return metric
}

function toUiMetric(metric?: string) {
  if (metric === 'claim_total') return 'receipt_total'
  if (metric === 'location_adjusted_claim_total') return 'location_adjusted_receipt_total'
  return metric
}

function receiptLabel(label: string) {
  return label
    .replace(/Location-Adjusted Claim Amount/g, 'Location-Adjusted Travel Expense Amount')
    .replace(/Claim Amount/g, 'Travel Expense Amount')
    .replace(/\bClaims\b/g, 'Travel Expense Entries')
    .replace(/\bclaims\b/g, 'travel expense entries')
    .replace(/\bClaim\b/g, 'Travel Expense Entry')
    .replace(/\bclaim\b/g, 'travel expense entry')
    .replace(/\bReceipts\b/g, 'Entries')
    .replace(/\breceipts\b/g, 'entries')
    .replace(/\bReceipt\b/g, 'Entry')
    .replace(/\breceipt\b/g, 'entry')
}

export async function fetchClaims(params?: {
  status?: string
  queue?: 'all' | 'active' | 'history'
  suspiciousOnly?: boolean
  riskLevel?: string
  search?: string
  sortBy?: string
  limit?: number
  offset?: number
}): Promise<ClaimSummary[]> {
  const page = await fetchClaimPage({
    ...params,
    limit: params?.limit ?? 200,
    offset: params?.offset ?? 0
  })
  return page.items
}

export async function fetchClaimPage(params?: {
  status?: string
  queue?: 'all' | 'active' | 'history'
  suspiciousOnly?: boolean
  riskLevel?: string
  search?: string
  sortBy?: string
  limit?: number
  offset?: number
}): Promise<ClaimListResponse> {
  const response = await api.get<ClaimListResponse>('/claims', {
    params: {
      status: params?.status,
      queue: params?.queue,
      suspicious_only: params?.suspiciousOnly || undefined,
      risk_level: params?.riskLevel || undefined,
      search: params?.search || undefined,
      sort_by: params?.sortBy || undefined,
      limit: params?.limit,
      offset: params?.offset
    }
  })
  return {
    ...response.data,
    items: response.data.items.map(withReceiptAliases)
  }
}

export async function fetchReceipts(params?: Parameters<typeof fetchClaims>[0]): Promise<ClaimSummary[]> {
  return fetchClaims(params)
}

export async function fetchReceiptPage(params?: Parameters<typeof fetchClaimPage>[0]): Promise<ClaimListResponse> {
  return fetchClaimPage(params)
}

export async function fetchClaimDetail(claimId: string): Promise<ClaimDetail> {
  const response = await api.get<ClaimDetail>(`/claims/${claimId}`)
  return withReceiptAliases(response.data)
}

export async function fetchClaimAnalysis(claimId: string): Promise<ClaimAnalysis> {
  const response = await api.get<ClaimAnalysis>(`/claims/${claimId}/analysis`)
  const data = withAnalysisAliases(response.data)
  return {
    ...data,
    evidence_summary: data.evidence_summary.map((evidence) => ({
      ...evidence,
      related_records: evidence.related_records?.map(withReceiptAliases)
    }))
  }
}

export async function fetchCaseTimeline(claimId: string): Promise<CaseTimeline> {
  const response = await api.get<CaseTimeline>(`/claims/${claimId}/case-timeline`)
  return response.data
}

export async function sendClaimChatMessage(
  claimId: string,
  message: string,
  history: ClaimChatMessage[]
): Promise<ClaimChatResponse> {
  const response = await api.post<ClaimChatResponse>(`/claims/${claimId}/chat`, { message, history })
  return response.data
}

export async function fetchClaimChatDebug(
  claimId: string,
  message: string,
  history: ClaimChatMessage[]
): Promise<ClaimChatDebugResponse> {
  const response = await api.post<ClaimChatDebugResponse>(`/claims/${claimId}/chat/debug`, { message, history })
  return response.data
}

export async function streamClaimChatMessage(
  claimId: string,
  message: string,
  history: ClaimChatMessage[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${api.defaults.baseURL}/claims/${claimId}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-Role': getStoredDemoRole()
    },
    body: JSON.stringify({ message, history }),
    signal
  })

  if (!response.ok) {
    throw new Error(`Chat request failed with status ${response.status}`)
  }

  if (!response.body) {
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk(decoder.decode(value, { stream: true }))
  }

  const remainder = decoder.decode()
  if (remainder) onChunk(remainder)
}

export async function updateCaseManagement(
  claimId: string,
  payload: CaseManagementPayload
): Promise<CaseManagement> {
  const response = await api.put<CaseManagement>(`/claims/${claimId}/case-management`, payload)
  return response.data
}

export async function uploadClaimPack(form: {
  employee_id: string
  employee_name: string
  department: string
  start_date?: string
  end_date?: string
  trip_settlement_date?: string
  trip_number?: string
  trip_activity?: string
  trip_boundary?: string
  to_country?: string
  expense_type?: string
  trip_duration_days?: string
  destination_city?: string
  claim_total?: string
  receipt_total?: string
  currency: string
  files: File[]
}) {
  const multipart = new FormData()
  multipart.append('employee_id', form.employee_id)
  multipart.append('employee_name', form.employee_name)
  multipart.append('department', form.department)
  multipart.append('claim_total', form.claim_total ?? form.receipt_total ?? '')
  multipart.append('currency', form.currency)
  if (form.start_date) multipart.append('start_date', form.start_date)
  if (form.end_date) multipart.append('end_date', form.end_date)
  if (form.trip_settlement_date) multipart.append('trip_settlement_date', form.trip_settlement_date)
  if (form.trip_number) multipart.append('trip_number', form.trip_number)
  if (form.trip_activity) multipart.append('trip_activity', form.trip_activity)
  if (form.trip_boundary) multipart.append('trip_boundary', form.trip_boundary)
  if (form.to_country) multipart.append('to_country', form.to_country)
  if (form.expense_type) multipart.append('expense_type', form.expense_type)
  if (form.trip_duration_days) multipart.append('trip_duration_days', form.trip_duration_days)
  if (form.destination_city) multipart.append('destination_city', form.destination_city)
  for (const file of form.files) {
    multipart.append('files', file)
  }

  const response = await api.post('/claims/upload', multipart, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  const data = response.data as { claim_id: string; status: string; document_count: number }
  return { ...data, receipt_id: data.claim_id }
}

export async function importClaimsFromExcel(
  file: File,
  autoAnalyze = true,
  onProgress?: (percent: number) => void
): Promise<ExcelImportResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('auto_analyze', String(autoAnalyze))

  const response = await api.post<ExcelImportResult>('/claims/import-excel', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (!onProgress) return
      const total = event.total || file.size || 0
      if (!total) {
        onProgress(15)
        return
      }
      onProgress(Math.min(100, Math.round((event.loaded / total) * 100)))
    }
  })
  return {
    ...response.data,
    imported_receipts: response.data.imported_claims,
    analyzed_receipts: response.data.analyzed_claims
  }
}

export async function importReceiptsFromExcel(
  file: File,
  autoAnalyze = true,
  onProgress?: (percent: number) => void
): Promise<ExcelImportResult> {
  return importClaimsFromExcel(file, autoAnalyze, onProgress)
}

export async function fetchActiveImport(): Promise<ActiveImport> {
  const response = await api.get<ActiveImport>('/imports/active')
  return response.data
}

export async function fetchActiveImportPreview(): Promise<SpreadsheetPreview> {
  const response = await api.get<SpreadsheetPreview>('/imports/active/preview')
  return response.data
}

export async function clearTravelExpenseDatabase(): Promise<{ deleted_claims: number; status: string }> {
  const response = await api.delete<{ deleted_claims: number; status: string }>('/claims/clear-all')
  return response.data
}

export async function downloadSampleSpreadsheet(): Promise<Blob> {
  const response = await api.get('/imports/sample-file', { responseType: 'blob' })
  return response.data as Blob
}

export async function analyzeClaim(claimId: string) {
  const response = await api.post(`/claims/${claimId}/analyze`)
  return response.data
}

export async function submitReviewAction(
  claimId: string,
  payload: { reviewer_id: string; status: string; notes?: string; disposition_reason?: string }
) {
  const response = await api.post(`/claims/${claimId}/review-action`, payload)
  return response.data
}

export async function fetchExecutiveDashboard(): Promise<ExecutiveDashboard> {
  const response = await api.get<ExecutiveDashboard>('/dashboards/executive')
  return withExecutiveAliases(response.data)
}

export async function fetchEmployeeDashboard(): Promise<EmployeeDashboard> {
  const response = await api.get<EmployeeDashboard>('/dashboards/employee')
  return withEmployeeDashboardAliases(response.data)
}

export async function fetchEmployeeRiskDashboard(): Promise<EmployeeRiskDashboard> {
  const response = await api.get<EmployeeRiskDashboard>('/dashboards/employee-risk')
  return withEmployeeRiskAliases(response.data)
}

export async function fetchOutlierMapDashboard(params?: { xMetric?: string; yMetric?: string }): Promise<OutlierMapDashboard> {
  const response = await api.get<OutlierMapDashboard>('/dashboards/outlier-map', {
    params: {
      x_metric: toApiMetric(params?.xMetric),
      y_metric: toApiMetric(params?.yMetric),
    }
  })
  const data = response.data as unknown as Record<string, unknown>

  const metricOptionsRaw = Array.isArray(data.metric_options) ? data.metric_options : []
  const metricOptions = metricOptionsRaw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        key: String(toUiMetric(String(row.key ?? '')) ?? ''),
        label: receiptLabel(String(row.label ?? row.key ?? '')),
      }
    })
    .filter((item) => item.key)

  const clustersRaw = Array.isArray(data.clusters) ? data.clusters : []
  const clusters = clustersRaw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        cluster_id: Number(row.cluster_id ?? -1),
        label: String(row.label ?? 'Cluster'),
        point_count: Number(row.point_count ?? 0),
        centroid_x: Number(row.centroid_x ?? 0),
        centroid_y: Number(row.centroid_y ?? 0),
      }
    })

  const pointsRaw = Array.isArray(data.points) ? data.points : []
  const points = pointsRaw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>
      const reasonsRaw = Array.isArray(row.outlier_reasons) ? row.outlier_reasons : []
      return {
        claim_id: String(row.claim_id ?? ''),
        receipt_id: String(row.claim_id ?? ''),
        employee_id: String(row.employee_id ?? ''),
        employee_name: String(row.employee_name ?? ''),
        department: String(row.department ?? ''),
        to_country: row.to_country == null ? null : String(row.to_country),
        to_city: row.to_city == null ? null : String(row.to_city),
        location_cost_factor: Number(row.location_cost_factor ?? 1),
        x_value: Number(row.x_value ?? 0),
        y_value: Number(row.y_value ?? 0),
        x_zscore: Number(row.x_zscore ?? 0),
        y_zscore: Number(row.y_zscore ?? 0),
        distance_score: Number(row.distance_score ?? 0),
        cluster_id: Number(row.cluster_id ?? -1),
        outlier_flag: Boolean(row.outlier_flag),
        outlier_reasons: reasonsRaw.map((reason) => String(reason)),
        suspicious_flag: Boolean(row.suspicious_flag),
        incorrect_flag: Boolean(row.incorrect_flag),
        risk_level: row.risk_level == null ? null : String(row.risk_level),
        risk_score: row.risk_score == null ? null : Number(row.risk_score),
        detection_count: Number(row.detection_count ?? 0),
      }
    })
    .filter((item) => item.claim_id)

  return {
    x_metric: String(toUiMetric(String(data.x_metric ?? params?.xMetric ?? 'claim_total'))),
    y_metric: String(toUiMetric(String(data.y_metric ?? params?.yMetric ?? 'trip_duration_days'))),
    x_label: receiptLabel(String(data.x_label ?? 'X Axis')),
    y_label: receiptLabel(String(data.y_label ?? 'Y Axis')),
    total_points: Number(data.total_points ?? 0),
    outlier_points: Number(data.outlier_points ?? 0),
    metric_options: metricOptions,
    clusters,
    points,
  }
}

export async function fetchPolicyRules(): Promise<PolicyRule[]> {
  const response = await api.get<PolicyRule[]>('/admin/policy-rules')
  return response.data
}

export async function upsertPolicyRule(rule: {
  key: string
  name: string
  category: string
  threshold?: number | null
  unit?: string | null
  weight?: number | null
  enabled: boolean
  source: string
}): Promise<PolicyRule> {
  const response = await api.post<PolicyRule>('/admin/policy-rules', rule)
  return response.data
}

export async function fetchUsers(): Promise<CurrentUser[]> {
  const response = await api.get<CurrentUser[]>('/admin/users')
  return response.data
}

export async function fetchRiskSettings(): Promise<RiskSettings> {
  const response = await api.get<RiskSettings>('/admin/risk-settings')
  return response.data
}

export async function fetchModelGovernance(): Promise<ModelGovernance> {
  const response = await api.get<ModelGovernance>('/governance/model')
  return response.data
}

export async function updateRiskSettings(payload: RiskSettings): Promise<RiskSettings> {
  const response = await api.put<RiskSettings>('/admin/risk-settings', payload)
  return response.data
}

export function getDocumentUrl(claimId: string, documentId: string): string {
  return `${api.defaults.baseURL}/claims/${claimId}/documents/${documentId}`
}

export async function fetchDocumentBlob(claimId: string, documentId: string): Promise<Blob> {
  const response = await api.get<Blob>(`/claims/${claimId}/documents/${documentId}`, {
    responseType: 'blob'
  })
  return response.data
}

export async function uploadClaimDocuments(claimId: string, files: File[]): Promise<DocumentRecord[]> {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))

  const response = await api.post<DocumentRecord[]>(`/claims/${claimId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export async function deleteClaimDocument(claimId: string, documentId: string): Promise<void> {
  await api.delete(`/claims/${claimId}/documents/${documentId}`)
}

export function getActiveSpreadsheetViewUrl(): string {
  return `${api.defaults.baseURL}/imports/active/view`
}

export function getSampleSpreadsheetUrl(): string {
  return `${api.defaults.baseURL}/imports/sample-file`
}
