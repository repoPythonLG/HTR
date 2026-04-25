import axios from 'axios'
import {
  AuthToken,
  ClaimAnalysis,
  ClaimDetail,
  ClaimSummary,
  CurrentUser,
  OutlierMapDashboard,
  EmployeeDashboard,
  EmployeeRiskDashboard,
  ExcelImportResult,
  ExecutiveDashboard,
  ActiveImport,
  PolicyRule,
  RiskSettings,
  SpreadsheetPreview
} from '../types'

const TOKEN_KEY = 'sabic_claims_access_token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api/v1'
})

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null) {
  if (!token) {
    window.localStorage.removeItem(TOKEN_KEY)
    return
  }
  window.localStorage.setItem(TOKEN_KEY, token)
}

export async function login(username: string, password: string): Promise<AuthToken> {
  const body = new URLSearchParams()
  body.set('username', username)
  body.set('password', password)

  const response = await api.post<AuthToken>('/auth/login', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  return response.data
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await api.get<CurrentUser>('/auth/me')
  return response.data
}

export async function fetchClaims(params?: {
  status?: string
  queue?: 'all' | 'active' | 'history'
  suspiciousOnly?: boolean
}): Promise<ClaimSummary[]> {
  const response = await api.get<ClaimSummary[]>('/claims', {
    params: {
      status: params?.status,
      queue: params?.queue,
      suspicious_only: params?.suspiciousOnly || undefined
    }
  })
  return response.data
}

export async function fetchClaimDetail(claimId: string): Promise<ClaimDetail> {
  const response = await api.get<ClaimDetail>(`/claims/${claimId}`)
  return response.data
}

export async function fetchClaimAnalysis(claimId: string): Promise<ClaimAnalysis> {
  const response = await api.get<ClaimAnalysis>(`/claims/${claimId}/analysis`)
  return response.data
}

export async function uploadClaimPack(form: {
  employee_id: string
  employee_name: string
  department: string
  start_date?: string
  end_date?: string
  destination_city?: string
  claim_total: string
  currency: string
  files: File[]
}) {
  const multipart = new FormData()
  multipart.append('employee_id', form.employee_id)
  multipart.append('employee_name', form.employee_name)
  multipart.append('department', form.department)
  multipart.append('claim_total', form.claim_total)
  multipart.append('currency', form.currency)
  if (form.start_date) multipart.append('start_date', form.start_date)
  if (form.end_date) multipart.append('end_date', form.end_date)
  if (form.destination_city) multipart.append('destination_city', form.destination_city)
  for (const file of form.files) {
    multipart.append('files', file)
  }

  const response = await api.post('/claims/upload', multipart, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data as { claim_id: string; status: string; document_count: number }
}

export async function importClaimsFromExcel(file: File, autoAnalyze = true): Promise<ExcelImportResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('auto_analyze', String(autoAnalyze))

  const response = await api.post<ExcelImportResult>('/claims/import-excel', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export async function fetchActiveImport(): Promise<ActiveImport> {
  const response = await api.get<ActiveImport>('/imports/active')
  return response.data
}

export async function fetchActiveImportPreview(): Promise<SpreadsheetPreview> {
  const response = await api.get<SpreadsheetPreview>('/imports/active/preview')
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
  return response.data
}

export async function fetchEmployeeDashboard(): Promise<EmployeeDashboard> {
  const response = await api.get<EmployeeDashboard>('/dashboards/employee')
  return response.data
}

export async function fetchEmployeeRiskDashboard(): Promise<EmployeeRiskDashboard> {
  const response = await api.get<EmployeeRiskDashboard>('/dashboards/employee-risk')
  return response.data
}

export async function fetchOutlierMapDashboard(params?: { xMetric?: string; yMetric?: string }): Promise<OutlierMapDashboard> {
  const response = await api.get<OutlierMapDashboard>('/dashboards/outlier-map', {
    params: {
      x_metric: params?.xMetric,
      y_metric: params?.yMetric,
    }
  })
  const data = response.data as unknown as Record<string, unknown>

  const metricOptionsRaw = Array.isArray(data.metric_options) ? data.metric_options : []
  const metricOptions = metricOptionsRaw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        key: String(row.key ?? ''),
        label: String(row.label ?? row.key ?? ''),
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
    x_metric: String(data.x_metric ?? params?.xMetric ?? 'claim_total'),
    y_metric: String(data.y_metric ?? params?.yMetric ?? 'trip_duration_days'),
    x_label: String(data.x_label ?? 'X Axis'),
    y_label: String(data.y_label ?? 'Y Axis'),
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

export async function updateRiskSettings(payload: RiskSettings): Promise<RiskSettings> {
  const response = await api.put<RiskSettings>('/admin/risk-settings', payload)
  return response.data
}

export function getDocumentUrl(claimId: string, documentId: string): string {
  return `${api.defaults.baseURL}/claims/${claimId}/documents/${documentId}`
}

export function getActiveSpreadsheetViewUrl(): string {
  return `${api.defaults.baseURL}/imports/active/view`
}

export function getSampleSpreadsheetUrl(): string {
  return `${api.defaults.baseURL}/imports/sample-file`
}
