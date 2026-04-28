import dayjs from 'dayjs'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchCaseTimeline, fetchClaimAnalysis, fetchClaimDetail, submitReviewAction, updateCaseManagement } from '../api/client'
import { AnalyzeIcon, DocumentIcon, RiskIcon, UsersIcon, WrongClaimIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { useAuth } from '../context/AuthContext'
import { CasePriority, CaseTimeline, CaseTimelineEvent, ClaimAnalysis, ClaimDetail, ClaimSummary } from '../types'
import { formatDetectionType } from '../utils/formatters'

function severityClass(severity: string) {
  const value = severity.toLowerCase()
  if (value === 'critical') return 'chip critical'
  if (value === 'high') return 'chip high'
  if (value === 'medium') return 'chip medium'
  return 'chip low'
}

function toFactLabel(key: string) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bClaims\b/g, 'Travel Expense Entries')
    .replace(/\bClaim\b/g, 'Travel Expense Entry')
    .replace(/\bReceipts\b/g, 'Entries')
    .replace(/\bReceipt\b/g, 'Entry')
}

function toFactValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') {
    return value.toLocaleString('en-GB', { maximumFractionDigits: 3 })
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    if (!value.length) return '—'
    return value.map((item) => toFactValue(item)).join(', ')
  }
  if (typeof value === 'object') return 'Structured data'
  return String(value)
}

type CaseFormState = {
  ownerId: string
  priority: CasePriority
  slaDueAt: string
  tags: string
  watchlist: boolean
  nextAction: string
}

const initialCaseForm: CaseFormState = {
  ownerId: '',
  priority: 'standard',
  slaDueAt: '',
  tags: '',
  watchlist: false,
  nextAction: ''
}

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return ''
  return dayjs(value).format('YYYY-MM-DDTHH:mm')
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  return dayjs(value).format('DD MMM YYYY HH:mm')
}

function formatTripRange(start?: string | null, end?: string | null) {
  if (!start && !end) return 'Dates not recorded'
  if (!start) return `Ends ${dayjs(end).format('DD MMM YYYY')}`
  if (!end) return `Starts ${dayjs(start).format('DD MMM YYYY')}`
  return `${dayjs(start).format('DD MMM YYYY')} - ${dayjs(end).format('DD MMM YYYY')}`
}

function formatMoney(value?: number | null, currency = 'SAR') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function priorityChipClass(priority?: string | null) {
  const value = (priority || 'standard').toLowerCase()
  if (value === 'executive') return 'chip critical'
  if (value === 'urgent') return 'chip high'
  if (value === 'priority') return 'chip medium'
  return 'chip low'
}

function timelineToneClass(value?: string | null) {
  const normalized = (value || '').toLowerCase()
  if (['critical', 'executive', 'escalated'].includes(normalized)) return 'timeline-critical'
  if (['high', 'urgent', 'reviewed'].includes(normalized)) return 'timeline-high'
  if (['medium', 'priority', 'under_review'].includes(normalized)) return 'timeline-medium'
  if (['low', 'standard', 'neutral', 'uploaded', 'analyzed'].includes(normalized)) return 'timeline-low'
  return 'timeline-neutral'
}

function slaStatus(detail: ClaimDetail) {
  if (!detail.case_sla_due_at) return { label: 'No SLA set', className: 'chip medium' }
  if (detail.case_closed_at) return { label: 'Closed', className: 'chip low' }
  const due = dayjs(detail.case_sla_due_at)
  const hoursRemaining = due.diff(dayjs(), 'hour')
  if (hoursRemaining < 0) return { label: 'Overdue', className: 'chip critical' }
  if (hoursRemaining <= 24) return { label: 'Due soon', className: 'chip high' }
  return { label: 'On track', className: 'chip low' }
}

type AnalysisFinding = ClaimAnalysis['findings'][number]
type AnalysisEvidence = ClaimAnalysis['evidence_summary'][number]

const HIDDEN_FACT_KEYS = new Set([
  'explanation_mode',
  'reviewer_guidance',
  'related_claims',
  'overlapping_claim_ids'
])

function numericFact(facts: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = facts[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
}

function formatCompactNumber(value: number, suffix = '') {
  return `${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })}${suffix}`
}

function evidenceNarrative(detectionType: string) {
  switch (detectionType) {
    case 'duplicate_receipt':
      return 'The same entry identifier appears in another record. Review the related entry before approving payment.'
    case 'overlapping_trips':
      return 'This employee has another trip record with overlapping dates. The related entry is shown below so the reviewer can compare both cases.'
    case 'amount_outlier_abnormality':
      return 'The amount sits outside the normal distribution for comparable travel expense entries. The visual shows the peer benchmark and where this entry lands.'
    case 'amount_above_peer_mean_threshold':
      return 'The amount exceeds the configured peer-mean threshold. The visual compares peer mean, approval limit, and this entry.'
    case 'location_cost_anomaly':
      return 'The amount remains high even after adjusting for country/city cost level, which means the destination alone does not explain the variance.'
    case 'hotel_above_benchmark':
      return 'The observed room rate is above the allowed benchmark for the destination city.'
    case 'near_approval_threshold':
      return 'The entry total is close to the approval threshold, which can indicate threshold management.'
    case 'extended_stay':
      return 'The trip duration is longer than the expected business-travel window plus policy buffer.'
    case 'trip_duration_outlier_abnormality':
      return 'The trip duration is unusual compared with similar travel expense entries.'
    case 'vendor_concentration':
      return "A high proportion of this employee's travel expense entries are associated with the same vendor."
    default:
      return 'The rule engine identified a pattern that requires reviewer attention. The key facts below explain the trigger.'
  }
}

function visibleFactEntries(facts: Record<string, unknown>) {
  return Object.entries(facts)
    .filter(([key, value]) => !HIDDEN_FACT_KEYS.has(key) && value !== null && value !== undefined && value !== '')
    .filter(([, value]) => typeof value !== 'object' || Array.isArray(value))
    .slice(0, 10)
}

type ScalePoint = {
  label: string
  value: number
  tone: 'claim' | 'benchmark' | 'limit'
}

function evidenceScalePoints(evidence: AnalysisEvidence): { title: string; suffix: string; points: ScalePoint[] } | null {
  const facts = evidence.supporting_facts
  const type = evidence.detection_type

  if (type === 'amount_outlier_abnormality') {
    const claim = numericFact(facts, ['claim_amount'])
    const mean = numericFact(facts, ['peer_mean'])
    const limit = numericFact(facts, ['iqr_upper_bound'])
    const median = numericFact(facts, ['peer_median'])
    if (claim === undefined || (mean === undefined && limit === undefined && median === undefined)) return null
    return {
      title: 'Peer amount distribution',
      suffix: ' SAR',
      points: [
        ...(median !== undefined ? [{ label: 'Peer median', value: median, tone: 'benchmark' as const }] : []),
        ...(mean !== undefined ? [{ label: 'Peer mean', value: mean, tone: 'benchmark' as const }] : []),
        ...(limit !== undefined ? [{ label: 'Outlier limit', value: limit, tone: 'limit' as const }] : []),
        { label: 'This entry', value: claim, tone: 'claim' }
      ]
    }
  }

  if (type === 'amount_above_peer_mean_threshold') {
    const claim = numericFact(facts, ['claim_amount'])
    const mean = numericFact(facts, ['peer_mean'])
    const threshold = numericFact(facts, ['threshold_amount'])
    if (claim === undefined || mean === undefined || threshold === undefined) return null
    return {
      title: 'Peer mean threshold',
      suffix: ' SAR',
      points: [
        { label: 'Peer mean', value: mean, tone: 'benchmark' },
        { label: 'Configured limit', value: threshold, tone: 'limit' },
        { label: 'This entry', value: claim, tone: 'claim' }
      ]
    }
  }

  if (type === 'location_cost_anomaly') {
    const claim = numericFact(facts, ['location_adjusted_claim_amount'])
    const mean = numericFact(facts, ['peer_mean_location_adjusted_amount'])
    const threshold = numericFact(facts, ['location_adjusted_threshold_amount'])
    if (claim === undefined || mean === undefined || threshold === undefined) return null
    return {
      title: 'Location-adjusted amount',
      suffix: ' SAR',
      points: [
        { label: 'Adjusted peer mean', value: mean, tone: 'benchmark' },
        { label: 'Adjusted limit', value: threshold, tone: 'limit' },
        { label: 'This entry adjusted', value: claim, tone: 'claim' }
      ]
    }
  }

  if (type === 'hotel_above_benchmark') {
    const observed = numericFact(facts, ['observed_room_rate'])
    const benchmark = numericFact(facts, ['city_benchmark'])
    const limit = numericFact(facts, ['allowed_with_deviation'])
    if (observed === undefined || benchmark === undefined || limit === undefined) return null
    return {
      title: 'Destination room-rate benchmark',
      suffix: ' SAR',
      points: [
        { label: 'City benchmark', value: benchmark, tone: 'benchmark' },
        { label: 'Allowed limit', value: limit, tone: 'limit' },
        { label: 'Observed rate', value: observed, tone: 'claim' }
      ]
    }
  }

  if (type === 'near_approval_threshold') {
    const total = numericFact(facts, ['claim_total'])
    const floor = numericFact(facts, ['near_threshold_floor'])
    const threshold = numericFact(facts, ['approval_threshold'])
    if (total === undefined || floor === undefined || threshold === undefined) return null
    return {
      title: 'Approval threshold proximity',
      suffix: ' SAR',
      points: [
        { label: 'Review band starts', value: floor, tone: 'benchmark' },
        { label: 'Approval threshold', value: threshold, tone: 'limit' },
        { label: 'This entry', value: total, tone: 'claim' }
      ]
    }
  }

  if (type === 'extended_stay') {
    const stay = numericFact(facts, ['stay_days'])
    const allowed = numericFact(facts, ['allowed_days'])
    if (stay === undefined || allowed === undefined) return null
    return {
      title: 'Trip duration policy window',
      suffix: ' days',
      points: [
        { label: 'Allowed duration', value: allowed, tone: 'limit' },
        { label: 'This trip', value: stay, tone: 'claim' }
      ]
    }
  }

  if (type === 'trip_duration_outlier_abnormality') {
    const duration = numericFact(facts, ['trip_duration_days'])
    const medianDuration = numericFact(facts, ['peer_median_duration'])
    const upper = numericFact(facts, ['peer_duration_iqr_upper'])
    if (duration === undefined || (medianDuration === undefined && upper === undefined)) return null
    return {
      title: 'Peer trip duration distribution',
      suffix: ' days',
      points: [
        ...(medianDuration !== undefined ? [{ label: 'Peer median', value: medianDuration, tone: 'benchmark' as const }] : []),
        ...(upper !== undefined ? [{ label: 'Outlier limit', value: upper, tone: 'limit' as const }] : []),
        { label: 'This trip', value: duration, tone: 'claim' }
      ]
    }
  }

  return null
}

function EvidenceScale({ evidence }: { evidence: AnalysisEvidence }) {
  const scale = evidenceScalePoints(evidence)
  if (!scale) return null

  const maxValue = Math.max(...scale.points.map((point) => point.value), 1)

  return (
    <div className="evidence-scale-card">
      <div className="evidence-scale-head">
        <strong>{scale.title}</strong>
        <span>Benchmark comparison</span>
      </div>
      <div className="evidence-scale-rows" aria-label={scale.title}>
        {scale.points.map((point) => {
          const width = Math.max(6, Math.min(100, (point.value / maxValue) * 100))
          return (
            <div
              key={`${point.label}-${point.value}`}
              className={`evidence-scale-row ${point.tone}`}
            >
              <div className="evidence-scale-row-meta">
                <span>{point.label}</span>
                <strong>{formatCompactNumber(point.value, scale.suffix)}</strong>
              </div>
              <div className="evidence-scale-bar-track">
                <span className="evidence-scale-bar-fill" style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RelatedRecords({
  evidence,
  onRelatedRecord
}: {
  evidence: AnalysisEvidence
  onRelatedRecord: (record: ClaimSummary) => void
}) {
  const records = evidence.related_records || []
  const fallbackIds = [
    ...((evidence.supporting_facts.related_claims as string[] | undefined) || []),
    ...((evidence.supporting_facts.overlapping_claim_ids as string[] | undefined) || [])
  ].filter(Boolean)

  if (!records.length && !fallbackIds.length) return null

  return (
    <div className="related-records-block">
      <h5>Related records to compare</h5>
      <div className="related-record-grid">
        {records.map((record) => (
          <button key={record.receipt_id} type="button" className="related-record-card" onClick={() => onRelatedRecord(record)}>
            <span className={severityClass(record.risk_level || 'low')}>{record.risk_level || 'Unscored'}</span>
            <strong>{record.trip_number || record.receipt_id}</strong>
            <p>{record.employee_name} · {record.employee_id}</p>
            <p className="related-record-date">
              {formatTripRange(record.start_date, record.end_date)}
              {record.trip_duration_days ? ` · ${record.trip_duration_days} days` : ''}
            </p>
            <p>{record.destination_city || record.to_city || record.to_country || 'Destination not recorded'}</p>
            <p>{formatMoney(record.receipt_total, record.currency)}</p>
          </button>
        ))}
        {!records.length && fallbackIds.map((id) => (
          <Link key={id} className="related-record-card" to={`/receipts/${id}/analysis`}>
            <strong>{id}</strong>
            <p>Open related travel expense entry record</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

function FindingEvidenceCard({
  finding,
  evidence,
  onTechnicalDetails,
  onRelatedRecord
}: {
  finding: AnalysisFinding
  evidence?: AnalysisEvidence
  onTechnicalDetails: (evidence: AnalysisEvidence) => void
  onRelatedRecord: (record: ClaimSummary) => void
}) {
  const facts = evidence?.supporting_facts || {}
  const visibleFacts = evidence ? visibleFactEntries(facts) : []

  return (
    <article className="finding-evidence-card">
      <div className="finding-evidence-head">
        <div>
          <p className="eyebrow">{finding.policy_reference ? toFactLabel(finding.policy_reference) : 'Detection rule'}</p>
          <h4>{formatDetectionType(finding.detection_type)}</h4>
        </div>
        <span className={severityClass(finding.severity)}>{finding.severity}</span>
      </div>

      <p className="finding-reason">{finding.reason}</p>
      <div className="finding-explanation">
        <strong>What this means</strong>
        <p>{evidenceNarrative(finding.detection_type)}</p>
      </div>

      {evidence && <EvidenceScale evidence={evidence} />}

      {visibleFacts.length > 0 && (
        <dl className="fact-grid compact finding-fact-grid">
          {visibleFacts.map(([key, value]) => (
            <div key={`${finding.detection_type}-${key}`} className="fact-item">
              <dt>{toFactLabel(key)}</dt>
              <dd>{toFactValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {evidence && <RelatedRecords evidence={evidence} onRelatedRecord={onRelatedRecord} />}

      <div className="finding-card-footer">
        <span>Risk contribution: {finding.risk_weight} pts</span>
        {evidence && (
          <button className="small-btn ghost-btn" type="button" onClick={() => onTechnicalDetails(evidence)}>
            View technical JSON
          </button>
        )}
      </div>
    </article>
  )
}

export function ClaimAnalysisPage() {
  const { receiptId, claimId } = useParams<{ receiptId?: string; claimId?: string }>()
  const activeReceiptId = receiptId || claimId
  const navigate = useNavigate()
  const { user } = useAuth()

  const [analysis, setAnalysis] = useState<ClaimAnalysis>()
  const [detail, setDetail] = useState<ClaimDetail>()
  const [timeline, setTimeline] = useState<CaseTimeline>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const [reviewerId, setReviewerId] = useState('')
  const [status, setStatus] = useState('under_review')
  const [notes, setNotes] = useState('')
  const [dispositionReason, setDispositionReason] = useState('')
  const [activeEvidence, setActiveEvidence] = useState<ClaimAnalysis['evidence_summary'][number] | null>(null)
  const [activeTimelineEvent, setActiveTimelineEvent] = useState<CaseTimelineEvent | null>(null)
  const [activeRelatedRecord, setActiveRelatedRecord] = useState<ClaimSummary | null>(null)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [caseForm, setCaseForm] = useState<CaseFormState>(initialCaseForm)
  const [caseSaving, setCaseSaving] = useState(false)
  const [caseMessage, setCaseMessage] = useState<string>()

  const canReview = user?.role === 'reviewer' || user?.role === 'administrator'

  function hydrateCaseForm(receipt: ClaimDetail) {
    setCaseForm({
      ownerId: receipt.case_owner_id || user?.employee_code || user?.username || '',
      priority: receipt.case_priority || 'standard',
      slaDueAt: toLocalDateTimeInput(receipt.case_sla_due_at),
      tags: (receipt.case_tags || []).join(', '),
      watchlist: Boolean(receipt.case_watchlist),
      nextAction: receipt.case_next_action || ''
    })
  }

  useEffect(() => {
    if (!activeReceiptId) return
    setLoading(true)
    setError(undefined)
    Promise.all([fetchClaimAnalysis(activeReceiptId), fetchClaimDetail(activeReceiptId), fetchCaseTimeline(activeReceiptId)])
      .then(([analysisResponse, detailResponse, timelineResponse]) => {
        setAnalysis(analysisResponse)
        setDetail(detailResponse)
        setTimeline(timelineResponse)
        hydrateCaseForm(detailResponse)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [activeReceiptId, user?.employee_code, user?.username])

  useEffect(() => {
    if (!activeEvidence && !activeTimelineEvent && !activeRelatedRecord) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveEvidence(null)
        setActiveTimelineEvent(null)
        setActiveRelatedRecord(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeEvidence, activeTimelineEvent, activeRelatedRecord])

  useEffect(() => {
    if (!canReview) return
    setReviewerId((current) => {
      if (current.trim()) return current
      return user?.employee_code || user?.username || ''
    })
  }, [canReview, user?.employee_code, user?.username])

  async function handleSubmitReview(event: FormEvent) {
    event.preventDefault()
    if (!activeReceiptId) return

    const reviewerValue = reviewerId.trim() || user?.employee_code || user?.username || ''
    if (!reviewerValue) {
      setError('Reviewer ID is required before submitting a decision.')
      return
    }

    setError(undefined)
    setSubmittingReview(true)
    try {
      await submitReviewAction(activeReceiptId, {
        reviewer_id: reviewerValue,
        status,
        notes: notes || undefined,
        disposition_reason: dispositionReason || undefined
      })
      const normalizedStatus = status.toLowerCase()
      if (normalizedStatus === 'approved' || normalizedStatus === 'dismissed' || normalizedStatus === 'escalated') {
        navigate('/history')
      } else {
        navigate('/receipts')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSubmittingReview(false)
    }
  }

  async function handleSaveCase(event: FormEvent) {
    event.preventDefault()
    if (!activeReceiptId) return

    setCaseSaving(true)
    setCaseMessage(undefined)
    setError(undefined)
    try {
      await updateCaseManagement(activeReceiptId, {
        case_owner_id: caseForm.ownerId.trim() || null,
        case_priority: caseForm.priority,
        case_sla_due_at: caseForm.slaDueAt ? new Date(caseForm.slaDueAt).toISOString() : null,
        case_tags: caseForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        case_watchlist: caseForm.watchlist,
        case_next_action: caseForm.nextAction.trim() || null
      })

      const [detailResponse, timelineResponse] = await Promise.all([
        fetchClaimDetail(activeReceiptId),
        fetchCaseTimeline(activeReceiptId)
      ])
      setDetail(detailResponse)
      setTimeline(timelineResponse)
      hydrateCaseForm(detailResponse)
      setCaseMessage('Case file saved. Audit timeline updated.')
    } catch (err) {
      setError(String(err))
    } finally {
      setCaseSaving(false)
    }
  }

  if (loading) return <div className="panel">Loading analysis window...</div>
  if (error) return <div className="error-box">{error}</div>
  if (!analysis || !detail) return <div className="panel">No analysis data available.</div>

  const receiptProfileRows = [
    { label: 'Employee', value: `${detail.employee_name} (${detail.employee_id})` },
    { label: 'Department', value: detail.department },
    { label: 'Trip Number', value: detail.trip_number },
    { label: 'Trip Activity', value: detail.trip_activity },
    { label: 'Trip Boundary', value: detail.trip_boundary },
    { label: 'Expense Type', value: detail.expense_type },
    { label: 'From', value: [detail.from_city, detail.from_country, detail.from_region].filter(Boolean).join(', ') },
    { label: 'To', value: [detail.to_city, detail.to_country, detail.to_region].filter(Boolean).join(', ') },
    { label: 'Destination City', value: detail.destination_city },
    { label: 'Trip Start', value: detail.start_date ? dayjs(detail.start_date).format('DD MMM YYYY') : '—' },
    { label: 'Trip End', value: detail.end_date ? dayjs(detail.end_date).format('DD MMM YYYY') : '—' },
    { label: 'Settlement Date', value: detail.trip_settlement_date ? dayjs(detail.trip_settlement_date).format('DD MMM YYYY') : '—' },
    { label: 'Trip Duration (Days)', value: detail.trip_duration_days },
    { label: 'Travel Expense Amount', value: `${detail.receipt_total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${detail.currency}` },
    { label: 'Status', value: detail.status },
    { label: 'Masked ID', value: detail.masked_id },
  ]

  const currentReceiptComparisonRows = [
    { label: 'Trip Number', value: detail.trip_number },
    { label: 'Employee', value: `${detail.employee_name} (${detail.employee_id})` },
    { label: 'Destination', value: [detail.to_city || detail.destination_city, detail.to_country].filter(Boolean).join(', ') },
    { label: 'Trip Dates', value: formatTripRange(detail.start_date, detail.end_date) },
    { label: 'Trip Duration', value: detail.trip_duration_days ? `${detail.trip_duration_days} days` : '—' },
    { label: 'Travel Expense Amount', value: formatMoney(detail.receipt_total, detail.currency) },
    { label: 'Status', value: detail.status },
  ]

  const relatedReceiptComparisonRows = activeRelatedRecord ? [
    { label: 'Trip Number', value: activeRelatedRecord.trip_number },
    { label: 'Employee', value: `${activeRelatedRecord.employee_name} (${activeRelatedRecord.employee_id})` },
    { label: 'Destination', value: [activeRelatedRecord.to_city || activeRelatedRecord.destination_city, activeRelatedRecord.to_country].filter(Boolean).join(', ') },
    { label: 'Trip Dates', value: formatTripRange(activeRelatedRecord.start_date, activeRelatedRecord.end_date) },
    { label: 'Trip Duration', value: activeRelatedRecord.trip_duration_days ? `${activeRelatedRecord.trip_duration_days} days` : '—' },
    { label: 'Travel Expense Amount', value: formatMoney(activeRelatedRecord.receipt_total, activeRelatedRecord.currency) },
    { label: 'Risk Level', value: activeRelatedRecord.risk_level || 'Unscored' },
  ] : []

  const caseRows = [
    { label: 'Case Owner', value: detail.case_owner_id },
    { label: 'Priority', value: detail.case_priority },
    { label: 'SLA Due', value: formatDateTime(detail.case_sla_due_at) },
    { label: 'Case Opened', value: formatDateTime(detail.case_opened_at) },
    { label: 'Case Closed', value: formatDateTime(detail.case_closed_at) },
    { label: 'Watchlist', value: detail.case_watchlist },
    { label: 'Tags', value: (detail.case_tags || []).join(', ') },
    { label: 'Next Action', value: detail.case_next_action },
  ]

  const sla = slaStatus(detail)
  const evidenceByDetection = new Map(analysis.evidence_summary.map((evidence) => [evidence.detection_type, evidence]))

  return (
    <div className="app-page analysis-page">
      <PageTabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            eyebrow: 'Entry',
            children: (
              <>
      <CollapsiblePanel className="panel hero-panel">
        <div>
          <p className="eyebrow">Travel Expense Investigation Workspace</p>
          <h2>Travel Expense Entry {analysis.receipt_id}</h2>
          <p>
            Employee {analysis.employee_name} · Last updated {dayjs(detail.updated_at).format('DD MMM YYYY HH:mm')}
          </p>
        </div>
        <div className="hero-actions">
          <span className={severityClass(analysis.risk_level)}>{analysis.risk_level}</span>
          <strong>{analysis.risk_score.toFixed(1)} pts</strong>
          <Link className="text-link" to="/receipts">Back to Workbench</Link>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel" title="Investigation Snapshot">
        <div className="metric-grid compact">
          <article className="metric-card">
            <div className="metric-line"><span>Primary Red Flag</span><RiskIcon className="metric-icon" /></div>
            <strong>{analysis.primary_red_flag ? formatDetectionType(analysis.primary_red_flag) : 'N/A'}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Suspicious Entry</span><RiskIcon className="metric-icon" /></div>
            <strong>{analysis.suspicious_flag ? 'Yes' : 'No'}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Incorrect Entry</span><WrongClaimIcon className="metric-icon" /></div>
            <strong>{analysis.incorrect_flag ? 'Yes' : 'No'}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Findings</span><AnalyzeIcon className="metric-icon" /></div>
            <strong>{analysis.findings.length}</strong>
          </article>
        </div>
      </CollapsiblePanel>

              </>
            )
          },
          {
            id: 'findings',
            label: 'Findings & Evidence',
            eyebrow: 'Review',
            children: (
      <CollapsiblePanel className="panel analysis-evidence-panel app-grow" allowFocusView>
        <article className="panel-scroll">
          <div className="section-title-row">
            <div>
              <h3 className="section-title"><AnalyzeIcon size={16} />Findings and Evidence</h3>
              <p className="muted-text">Each finding explains the issue, shows the business evidence, and highlights related records where relevant.</p>
            </div>
            <span className="source-ref-pill">{analysis.findings.length} findings</span>
          </div>

          <div className="receipt-profile-card">
            <h4>Travel Expense Entry Details</h4>
            <p className="muted-text">Business-friendly view of the imported travel expense table entry and key travel context.</p>
            <dl className="fact-grid">
              {receiptProfileRows.map((row) => (
                <div key={row.label} className="fact-item">
                  <dt>{row.label}</dt>
                  <dd>{toFactValue(row.value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="finding-evidence-grid">
            {analysis.findings.map((finding) => (
              <FindingEvidenceCard
                key={`${finding.detection_type}-${finding.policy_reference || 'none'}`}
                finding={finding}
                evidence={evidenceByDetection.get(finding.detection_type)}
                onTechnicalDetails={setActiveEvidence}
                onRelatedRecord={setActiveRelatedRecord}
              />
            ))}
          </div>
        </article>
      </CollapsiblePanel>

            )
          },
          {
            id: 'case-file',
            label: 'Case File',
            eyebrow: 'Audit',
            children: (
      <CollapsiblePanel className="panel two-col app-grow case-management-panel" title="Case Management and Audit Timeline" allowFocusView>
        <article className="panel-scroll case-workspace">
          <div className="section-title-row">
            <h3 className="section-title"><UsersIcon size={16} />Case Management</h3>
            <span className={sla.className}>{sla.label}</span>
          </div>

          <div className="case-command-card">
            <div>
              <p className="eyebrow">Current Case State</p>
              <h4>{detail.case_owner_id || 'Unassigned'} · {detail.case_priority || 'standard'}</h4>
              <p className="muted-text">
                SLA {formatDateTime(detail.case_sla_due_at)} · {detail.case_watchlist ? 'Watchlisted' : 'Not watchlisted'}
              </p>
            </div>
            <span className={priorityChipClass(detail.case_priority)}>{detail.case_priority || 'standard'}</span>
          </div>

          {canReview ? (
            <form className="case-form" onSubmit={handleSaveCase}>
              <div className="split-row">
                <label>
                  Case Owner
                  <input
                    value={caseForm.ownerId}
                    onChange={(event) => setCaseForm((current) => ({ ...current, ownerId: event.target.value }))}
                    placeholder="reviewer@sabic.local"
                  />
                </label>
                <label>
                  Priority
                  <select
                    value={caseForm.priority}
                    onChange={(event) => setCaseForm((current) => ({ ...current, priority: event.target.value as CasePriority }))}
                  >
                    <option value="standard">Standard</option>
                    <option value="priority">Priority</option>
                    <option value="urgent">Urgent</option>
                    <option value="executive">Executive</option>
                  </select>
                </label>
              </div>

              <div className="split-row">
                <label>
                  SLA Due
                  <input
                    type="datetime-local"
                    value={caseForm.slaDueAt}
                    onChange={(event) => setCaseForm((current) => ({ ...current, slaDueAt: event.target.value }))}
                  />
                </label>
                <label className="checkbox-inline case-watch-toggle">
                  <input
                    type="checkbox"
                    checked={caseForm.watchlist}
                    onChange={(event) => setCaseForm((current) => ({ ...current, watchlist: event.target.checked }))}
                  />
                  Add to reviewer watchlist
                </label>
              </div>

              <label>
                Tags
                <input
                  value={caseForm.tags}
                  onChange={(event) => setCaseForm((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="executive review, expense variance, policy exception"
                />
              </label>

              <label>
                Next Action
                <textarea
                  value={caseForm.nextAction}
                  onChange={(event) => setCaseForm((current) => ({ ...current, nextAction: event.target.value }))}
                  rows={3}
                  placeholder="Request supporting evidence, validate itinerary, escalate to HR business partner..."
                />
              </label>

              {caseMessage && <div className="success-box">{caseMessage}</div>}
              <button type="submit" disabled={caseSaving}>
                <span className="btn-inline"><DocumentIcon size={14} />{caseSaving ? 'Saving case...' : 'Save Case File'}</span>
              </button>
            </form>
          ) : (
            <dl className="fact-grid">
              {caseRows.map((row) => (
                <div key={row.label} className="fact-item">
                  <dt>{row.label}</dt>
                  <dd>{toFactValue(row.value)}</dd>
                </div>
              ))}
            </dl>
          )}

          {canReview && (
            <dl className="fact-grid case-summary-grid">
              {caseRows.map((row) => (
                <div key={row.label} className="fact-item">
                  <dt>{row.label}</dt>
                  <dd>{toFactValue(row.value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </article>

        <article className="panel-scroll">
          <div className="section-title-row">
            <h3 className="section-title"><DocumentIcon size={16} />Audit Timeline</h3>
            <span className="source-ref-pill">{timeline?.events.length || 0} events</span>
          </div>
          <div className="case-timeline">
            {(!timeline || timeline.events.length === 0) && (
              <p className="empty-muted">No case events have been recorded yet.</p>
            )}
            {timeline?.events.map((event) => (
              <article key={event.event_id} className={`timeline-item ${timelineToneClass(event.severity)}`}>
                <span className="timeline-dot" aria-hidden="true" />
                <div className="timeline-card">
                  <div className="timeline-head">
                    <div>
                      <h4>{event.title}</h4>
                      <p>{formatDateTime(event.timestamp)}</p>
                    </div>
                    <button className="small-btn ghost-btn" type="button" onClick={() => setActiveTimelineEvent(event)}>
                      Details
                    </button>
                  </div>
                  <p className="timeline-description">{event.description}</p>
                  <div className="timeline-meta">
                    <span>{formatDetectionType(event.event_type)}</span>
                    {event.actor && <span>Actor: {event.actor}</span>}
                    {event.severity && <span>{event.severity}</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>
      </CollapsiblePanel>

            )
          },
          ...(canReview ? [{
            id: 'decision',
            label: 'Decision',
            eyebrow: 'Review',
            children: (
        <CollapsiblePanel className="panel">
          <h3 className="section-title"><RiskIcon size={16} />Decision</h3>
          <form className="form-grid" onSubmit={handleSubmitReview}>
            <div className="split-row">
              <label>
                Reviewer ID
                <input value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} placeholder="REV-101" required />
              </label>
              <label>
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="escalated">Escalated</option>
                </select>
              </label>
            </div>

            <label>
              Decision Reason
              <input value={dispositionReason} onChange={(e) => setDispositionReason(e.target.value)} placeholder="high_risk" />
            </label>

            <label>
              Investigation Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </label>

            <button type="submit" disabled={submittingReview}>
              <span className="btn-inline"><AnalyzeIcon size={14} />{submittingReview ? 'Submitting...' : 'Submit Decision'}</span>
            </button>
          </form>
        </CollapsiblePanel>
            )
          }] : [])
        ]}
      />

      {activeEvidence && (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveEvidence(null)}>
          <section className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>{formatDetectionType(activeEvidence.detection_type)} · Technical JSON</h3>
              <button type="button" className="small-btn" onClick={() => setActiveEvidence(null)}>Close</button>
            </div>
            <div className="modal-body">
              <h4>Supporting Facts (raw)</h4>
              <pre>{JSON.stringify(activeEvidence.supporting_facts, null, 2)}</pre>
              <h4>Source References (raw)</h4>
              <pre>{JSON.stringify(activeEvidence.source_references, null, 2)}</pre>
            </div>
          </section>
        </div>
      )}

      {activeRelatedRecord && (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveRelatedRecord(null)}>
          <section className="modal-panel related-record-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Related Overlapping Trip Details</h3>
              <button type="button" className="small-btn" onClick={() => setActiveRelatedRecord(null)}>Close</button>
            </div>
            <div className="modal-body">
              <p className="muted-text">
                Compare the current travel expense entry with the related record that overlaps this employee's travel window.
              </p>
              <div className="related-comparison-grid">
                <article className="receipt-profile-card">
                  <h4>Current travel expense entry</h4>
                  <dl className="fact-grid compact">
                    {currentReceiptComparisonRows.map((row) => (
                      <div key={`current-${row.label}`} className="fact-item">
                        <dt>{row.label}</dt>
                        <dd>{toFactValue(row.value)}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
                <article className="receipt-profile-card">
                  <h4>Related travel expense entry</h4>
                  <dl className="fact-grid compact">
                    {relatedReceiptComparisonRows.map((row) => (
                      <div key={`related-${row.label}`} className="fact-item">
                        <dt>{row.label}</dt>
                        <dd>{toFactValue(row.value)}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              </div>
              <Link
                className="button-link"
                to={`/receipts/${activeRelatedRecord.receipt_id}/analysis`}
                onClick={() => setActiveRelatedRecord(null)}
              >
                Open full related analysis
              </Link>
            </div>
          </section>
        </div>
      )}

      {activeTimelineEvent && (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveTimelineEvent(null)}>
          <section className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>{activeTimelineEvent.title} · Audit Event</h3>
              <button type="button" className="small-btn" onClick={() => setActiveTimelineEvent(null)}>Close</button>
            </div>
            <div className="modal-body">
              <dl className="fact-grid">
                <div className="fact-item">
                  <dt>Event Type</dt>
                  <dd>{formatDetectionType(activeTimelineEvent.event_type)}</dd>
                </div>
                <div className="fact-item">
                  <dt>Timestamp</dt>
                  <dd>{formatDateTime(activeTimelineEvent.timestamp)}</dd>
                </div>
                <div className="fact-item">
                  <dt>Actor</dt>
                  <dd>{toFactValue(activeTimelineEvent.actor)}</dd>
                </div>
                <div className="fact-item">
                  <dt>Severity</dt>
                  <dd>{toFactValue(activeTimelineEvent.severity)}</dd>
                </div>
              </dl>
              <h4>Description</h4>
              <p>{activeTimelineEvent.description}</p>
              <h4>Event Metadata (raw)</h4>
              <pre>{JSON.stringify(activeTimelineEvent.metadata, null, 2)}</pre>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
