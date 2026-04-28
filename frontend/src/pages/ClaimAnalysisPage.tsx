import dayjs from 'dayjs'
import { FormEvent, PointerEvent, useEffect, useRef, useState, WheelEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteClaimDocument, fetchCaseTimeline, fetchClaimAnalysis, fetchClaimDetail, fetchDocumentBlob, getDocumentUrl, submitReviewAction, updateCaseManagement, uploadClaimDocuments } from '../api/client'
import { AnalyzeIcon, DocumentIcon, RiskIcon, UploadIcon, UsersIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { useAuth } from '../context/AuthContext'
import { CasePriority, CaseTimeline, CaseTimelineEvent, ClaimAnalysis, ClaimDetail, ClaimSummary, DocumentRecord } from '../types'
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

type DocumentPreviewKind = 'image' | 'pdf' | 'text' | 'spreadsheet' | 'other'

type ViewerOffset = {
  x: number
  y: number
}

function documentPreviewKind(document: DocumentRecord): DocumentPreviewKind {
  const mime = (document.mime_type || '').toLowerCase()
  const fileName = document.file_name.toLowerCase()
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fileName)) return 'image'
  if (mime.includes('pdf') || fileName.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('text/') || /\.(txt|csv|json|log|md)$/.test(fileName)) return 'text'
  if (/\.(xlsx|xls)$/.test(fileName)) return 'spreadsheet'
  return 'other'
}

function documentKindLabel(document: DocumentRecord) {
  const kind = documentPreviewKind(document)
  if (kind === 'pdf') return 'PDF receipt'
  if (kind === 'image') return 'Image receipt'
  if (kind === 'text') return 'Text evidence'
  if (kind === 'spreadsheet') return 'Spreadsheet evidence'
  return 'Document evidence'
}

function previewBlobForKind(blob: Blob, kind: DocumentPreviewKind, document: DocumentRecord) {
  if (kind === 'text') return new Blob([blob], { type: 'text/plain;charset=utf-8' })
  if (kind === 'pdf') return new Blob([blob], { type: 'application/pdf' })
  if (kind === 'image') {
    const mimeType = document.mime_type?.startsWith('image/') ? document.mime_type : blob.type || 'image/png'
    return new Blob([blob], { type: mimeType })
  }
  return blob
}

function DocumentPreview({
  claimId,
  document,
  zoom = 1,
  offset = { x: 0, y: 0 },
  interactive = false,
  isPanning = false,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: {
  claimId: string
  document: DocumentRecord
  zoom?: number
  offset?: ViewerOffset
  interactive?: boolean
  isPanning?: boolean
  onWheel?: (event: WheelEvent<HTMLDivElement>) => void
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void
}) {
  const kind = documentPreviewKind(document)
  const directUrl = getDocumentUrl(claimId, document.document_id)
  const canInlinePreview = kind === 'image' || kind === 'pdf' || kind === 'text'
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string>()
  const transform = interactive
    ? { transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }
    : undefined

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | undefined

    setPreviewUrl(undefined)
    setPreviewError(undefined)

    if (!canInlinePreview) {
      setPreviewLoading(false)
      return undefined
    }

    setPreviewLoading(true)
    fetchDocumentBlob(claimId, document.document_id)
      .then((blob) => {
        const nextUrl = URL.createObjectURL(previewBlobForKind(blob, kind, document))
        if (cancelled) {
          URL.revokeObjectURL(nextUrl)
          return
        }
        objectUrl = nextUrl
        setPreviewUrl(nextUrl)
      })
      .catch(() => {
        if (!cancelled) setPreviewError('Preview could not be loaded in the application.')
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [canInlinePreview, claimId, document, kind])

  return (
    <div
      className={`document-preview-frame ${kind}${interactive ? ' is-interactive' : ''}${isPanning ? ' is-panning' : ''}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="document-preview-stage" style={transform}>
        {previewLoading && (
          <div className="document-preview-empty">
            <DocumentIcon size={34} />
            <strong>Loading preview...</strong>
          </div>
        )}
        {previewError && (
          <div className="document-preview-empty">
            <DocumentIcon size={34} />
            <strong>Preview unavailable</strong>
            <p>{previewError}</p>
            <a href={directUrl} target="_blank" rel="noreferrer" className="text-link">Open original</a>
          </div>
        )}
        {!previewLoading && !previewError && kind === 'image' && previewUrl && (
          <img src={previewUrl} alt={`Preview of ${document.file_name}`} draggable={false} />
        )}
        {!previewLoading && !previewError && (kind === 'pdf' || kind === 'text') && previewUrl && (
          <iframe src={previewUrl} title={`Preview of ${document.file_name}`} />
        )}
        {!previewLoading && !previewError && (kind === 'spreadsheet' || kind === 'other') && (
          <div className="document-preview-empty">
            <DocumentIcon size={42} />
            <strong>Preview is not available for this file type</strong>
            <p>Open the original document to inspect it in the browser or a desktop viewer.</p>
            <a href={directUrl} target="_blank" rel="noreferrer" className="text-link">Open original</a>
          </div>
        )}
      </div>
    </div>
  )
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
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [documentUploadFiles, setDocumentUploadFiles] = useState<File[]>([])
  const [documentUploading, setDocumentUploading] = useState(false)
  const [documentMessage, setDocumentMessage] = useState<string>()
  const [documentError, setDocumentError] = useState<string>()
  const [focusedDocument, setFocusedDocument] = useState<DocumentRecord | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [viewerOffset, setViewerOffset] = useState<ViewerOffset>({ x: 0, y: 0 })
  const [isViewerPanning, setIsViewerPanning] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [caseForm, setCaseForm] = useState<CaseFormState>(initialCaseForm)
  const [caseSaving, setCaseSaving] = useState(false)
  const [caseMessage, setCaseMessage] = useState<string>()
  const documentInputRef = useRef<HTMLInputElement | null>(null)
  const panStartRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null)

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
    if (!activeEvidence && !activeTimelineEvent && !activeRelatedRecord && !focusedDocument) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveEvidence(null)
        setActiveTimelineEvent(null)
        setActiveRelatedRecord(null)
        setFocusedDocument(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeEvidence, activeTimelineEvent, activeRelatedRecord, focusedDocument])

  useEffect(() => {
    const documents = detail?.documents || []
    if (!documents.length) {
      if (activeDocumentId) setActiveDocumentId(null)
      return
    }
    if (activeDocumentId && !documents.some((document) => document.document_id === activeDocumentId)) {
      setActiveDocumentId(null)
    }
  }, [activeDocumentId, detail?.documents])

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

  async function refreshWorkspace(selectDocumentId?: string | null) {
    if (!activeReceiptId) return
    const [detailResponse, timelineResponse] = await Promise.all([
      fetchClaimDetail(activeReceiptId),
      fetchCaseTimeline(activeReceiptId)
    ])
    setDetail(detailResponse)
    setTimeline(timelineResponse)
    if (selectDocumentId !== undefined) {
      setActiveDocumentId(selectDocumentId)
    } else if (!detailResponse.documents.some((document) => document.document_id === activeDocumentId)) {
      setActiveDocumentId(detailResponse.documents[0]?.document_id ?? null)
    }
  }

  async function handleDocumentUpload(event: FormEvent) {
    event.preventDefault()
    if (!activeReceiptId || !documentUploadFiles.length) return

    setDocumentUploading(true)
    setDocumentMessage(undefined)
    setDocumentError(undefined)
    try {
      const uploaded = await uploadClaimDocuments(activeReceiptId, documentUploadFiles)
      await refreshWorkspace(uploaded[0]?.document_id ?? null)
      setDocumentUploadFiles([])
      if (documentInputRef.current) documentInputRef.current.value = ''
      setDocumentMessage(`${uploaded.length} receipt evidence file${uploaded.length === 1 ? '' : 's'} uploaded and stored in the case file.`)
    } catch (err) {
      setDocumentError(String(err))
    } finally {
      setDocumentUploading(false)
    }
  }

  async function handleDocumentDelete(document: DocumentRecord) {
    if (!activeReceiptId) return
    const confirmed = window.confirm(`Remove ${document.file_name} from this case file?`)
    if (!confirmed) return

    setDocumentMessage(undefined)
    setDocumentError(undefined)
    try {
      await deleteClaimDocument(activeReceiptId, document.document_id)
      const nextDocumentId = detail?.documents.find((item) => item.document_id !== document.document_id)?.document_id ?? null
      await refreshWorkspace(nextDocumentId)
      setDocumentMessage(`${document.file_name} was removed from the case file.`)
    } catch (err) {
      setDocumentError(String(err))
    }
  }

  function openFocusedDocument(document: DocumentRecord) {
    setFocusedDocument(document)
    setViewerZoom(1)
    setViewerOffset({ x: 0, y: 0 })
    setIsViewerPanning(false)
    panStartRef.current = null
  }

  function handleViewerWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const delta = event.deltaY < 0 ? 0.15 : -0.15
    setViewerZoom((current) => Math.max(0.45, Math.min(4, Number((current + delta).toFixed(2)))))
  }

  function handleViewerPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    panStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: viewerOffset.x,
      offsetY: viewerOffset.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsViewerPanning(true)
  }

  function handleViewerPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    setViewerOffset({
      x: start.offsetX + event.clientX - start.x,
      y: start.offsetY + event.clientY - start.y
    })
  }

  function handleViewerPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = panStartRef.current
    if (start?.pointerId === event.pointerId) {
      panStartRef.current = null
      setIsViewerPanning(false)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
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
  const selectedDocument = detail.documents.find((document) => document.document_id === activeDocumentId)
  const documentUploadLabel = documentUploadFiles.length
    ? `${documentUploadFiles.length} file${documentUploadFiles.length === 1 ? '' : 's'} selected`
    : 'Select receipt evidence files'
  const documentUploadHelper = documentUploadFiles.length
    ? documentUploadFiles.map((file) => file.name).join(', ')
    : 'PDF, image, spreadsheet, text, or scanned receipt files'

  return (
    <div className="app-page analysis-page">
      <PageTabs
        defaultTabId="findings"
        tabs={[
          {
            id: 'findings',
            label: 'Findings & Evidence',
            eyebrow: 'Review',
            children: (
              <CollapsiblePanel className="panel analysis-evidence-panel app-grow" title="Findings and Evidence" allowFocusView>
                <article className="panel-scroll">
                  <div className="analysis-summary-strip">
                    <div>
                      <p className="eyebrow">Travel Expense Entry</p>
                      <h2>Travel Expense Entry {analysis.receipt_id}</h2>
                      <p>Employee {analysis.employee_name} · Last updated {dayjs(detail.updated_at).format('DD MMM YYYY HH:mm')}</p>
                    </div>
                    <div className="analysis-summary-actions">
                      <span className={severityClass(analysis.risk_level)}>{analysis.risk_level}</span>
                      <strong>{analysis.risk_score.toFixed(1)} pts</strong>
                      <Link className="text-link" to="/receipts">Back to Workbench</Link>
                    </div>
                  </div>

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
            id: 'receipts',
            label: 'Receipts',
            eyebrow: 'Evidence',
            children: (
              <CollapsiblePanel className="panel document-vault-panel app-grow" title="Receipt Evidence Vault" allowFocusView>
                <article className="document-vault-layout">
                  <section className="document-upload-card">
                    <div>
                      <h3 className="section-title"><UploadIcon size={16} />Receipt Evidence Upload</h3>
                      <p className="muted-text">Attach hotel receipts, scanned folios, PDFs, images, or supporting expense evidence to this case file.</p>
                    </div>
                    <form className="form-grid" onSubmit={handleDocumentUpload}>
                      <input
                        ref={documentInputRef}
                        id="case-receipt-document-upload"
                        className="file-input-hidden"
                        type="file"
                        multiple
                        onChange={(event) => setDocumentUploadFiles(Array.from(event.target.files || []))}
                      />
                      <label className={`upload-dropzone ${documentUploadFiles.length ? 'has-file' : ''}`} htmlFor="case-receipt-document-upload">
                        <span className="upload-dropzone-icon"><DocumentIcon size={22} /></span>
                        <span className="upload-dropzone-copy">
                          <strong>{documentUploadLabel}</strong>
                          <small>{documentUploadHelper}</small>
                        </span>
                        <span className="upload-dropzone-action">{documentUploadFiles.length ? 'Change files' : 'Browse files'}</span>
                      </label>

                      {documentMessage && <div className="success-box">{documentMessage}</div>}
                      {documentError && <div className="error-box">{documentError}</div>}
                      <button type="submit" disabled={!documentUploadFiles.length || documentUploading}>
                        <span className="btn-inline"><UploadIcon size={14} />{documentUploading ? 'Uploading receipts...' : 'Upload Receipts'}</span>
                      </button>
                    </form>
                  </section>

                  <section className="document-vault-main">
                    <div className="section-title-row document-vault-title-row">
                      <div>
                        <h3 className="section-title"><DocumentIcon size={16} />Stored Receipt Evidence</h3>
                        <p className="muted-text">Select a receipt to preview it. Use focused preview for zooming and left-button mouse panning.</p>
                      </div>
                      <span className="source-ref-pill">{detail.documents.length} files</span>
                    </div>

                    <div className="document-browser-grid">
                      <div className="document-list-panel" aria-label="Stored receipt files">
                        {!detail.documents.length && (
                          <div className="empty-muted document-empty-state">
                            <DocumentIcon size={34} />
                            <strong>No receipt evidence uploaded yet.</strong>
                            <span>Upload files from the left panel to build the case evidence pack.</span>
                          </div>
                        )}
                        {detail.documents.map((document) => (
                          <button
                            key={document.document_id}
                            type="button"
                            className={`document-list-item${selectedDocument?.document_id === document.document_id ? ' is-active' : ''}`}
                            onClick={() => setActiveDocumentId(document.document_id)}
                          >
                            <span className="document-list-icon"><DocumentIcon size={18} /></span>
                            <span className="document-list-copy">
                              <strong>{document.file_name}</strong>
                              <small>{documentKindLabel(document)} · {formatDateTime(document.created_at)}</small>
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="document-preview-card">
                        {selectedDocument ? (
                          <>
                            <div className="document-preview-head">
                              <div className="document-preview-title">
                                <p className="eyebrow">{documentKindLabel(selectedDocument)}</p>
                                <h4>{selectedDocument.file_name}</h4>
                                <p className="muted-text">Stored {formatDateTime(selectedDocument.created_at)} · {selectedDocument.document_type || 'unclassified'}</p>
                              </div>
                              <div className="document-preview-actions">
                                <a className="small-btn ghost-btn" href={getDocumentUrl(detail.receipt_id, selectedDocument.document_id)} target="_blank" rel="noreferrer">
                                  Open Original
                                </a>
                                <button type="button" className="small-btn" onClick={() => openFocusedDocument(selectedDocument)}>
                                  Focus Preview
                                </button>
                                <button type="button" className="small-btn danger-btn" onClick={() => handleDocumentDelete(selectedDocument)}>
                                  Remove
                                </button>
                              </div>
                            </div>
                            <DocumentPreview claimId={detail.receipt_id} document={selectedDocument} />
                          </>
                        ) : (
                          <div className="empty-muted document-empty-state">
                            <DocumentIcon size={34} />
                            <strong>Select receipt evidence to preview.</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </article>
              </CollapsiblePanel>
            )
          },
          {
            id: 'case-file',
            label: 'Case File',
            eyebrow: 'Audit',
            children: (
              <CollapsiblePanel className="panel app-grow case-management-panel" title="Case Management" allowFocusView>
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
              </CollapsiblePanel>
            )
          },
          {
            id: 'timeline',
            label: 'Audit Timeline',
            eyebrow: 'Audit',
            children: (
              <CollapsiblePanel className="panel app-grow audit-timeline-panel" title="Audit Timeline" allowFocusView>
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

      {focusedDocument && (
        <div className="modal-backdrop" role="presentation" onClick={() => setFocusedDocument(null)}>
          <section className="modal-panel document-focus-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head document-focus-head">
              <div>
                <h3>{focusedDocument.file_name}</h3>
                <p className="muted-text">Mouse wheel to zoom. Hold left mouse button and drag to pan.</p>
              </div>
              <div className="document-focus-controls">
                <button type="button" className="small-btn ghost-btn" onClick={() => setViewerZoom((current) => Math.max(0.45, Number((current - 0.2).toFixed(2))))}>Zoom Out</button>
                <span className="source-ref-pill">{Math.round(viewerZoom * 100)}%</span>
                <button type="button" className="small-btn ghost-btn" onClick={() => setViewerZoom((current) => Math.min(4, Number((current + 0.2).toFixed(2))))}>Zoom In</button>
                <button
                  type="button"
                  className="small-btn ghost-btn"
                  onClick={() => {
                    setViewerZoom(1)
                    setViewerOffset({ x: 0, y: 0 })
                  }}
                >
                  Reset
                </button>
                <button type="button" className="small-btn" onClick={() => setFocusedDocument(null)}>Close</button>
              </div>
            </div>
            <DocumentPreview
              claimId={detail.receipt_id}
              document={focusedDocument}
              zoom={viewerZoom}
              offset={viewerOffset}
              interactive
              isPanning={isViewerPanning}
              onWheel={handleViewerWheel}
              onPointerDown={handleViewerPointerDown}
              onPointerMove={handleViewerPointerMove}
              onPointerUp={handleViewerPointerUp}
            />
          </section>
        </div>
      )}

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
