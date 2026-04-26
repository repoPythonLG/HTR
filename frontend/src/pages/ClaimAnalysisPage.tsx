import dayjs from 'dayjs'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchCaseTimeline, fetchClaimAnalysis, fetchClaimDetail, getDocumentUrl, submitReviewAction, updateCaseManagement } from '../api/client'
import { AnalyzeIcon, ClaimsIcon, DocumentIcon, RiskIcon, UsersIcon, WrongClaimIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { useAuth } from '../context/AuthContext'
import { CasePriority, CaseTimeline, CaseTimelineEvent, ClaimAnalysis, ClaimDetail } from '../types'
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

export function ClaimAnalysisPage() {
  const { claimId } = useParams<{ claimId: string }>()
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
  const [submittingReview, setSubmittingReview] = useState(false)
  const [caseForm, setCaseForm] = useState<CaseFormState>(initialCaseForm)
  const [caseSaving, setCaseSaving] = useState(false)
  const [caseMessage, setCaseMessage] = useState<string>()

  const canReview = user?.role === 'reviewer' || user?.role === 'administrator'

  function hydrateCaseForm(claim: ClaimDetail) {
    setCaseForm({
      ownerId: claim.case_owner_id || user?.employee_code || user?.username || '',
      priority: claim.case_priority || 'standard',
      slaDueAt: toLocalDateTimeInput(claim.case_sla_due_at),
      tags: (claim.case_tags || []).join(', '),
      watchlist: Boolean(claim.case_watchlist),
      nextAction: claim.case_next_action || ''
    })
  }

  useEffect(() => {
    if (!claimId) return
    setLoading(true)
    setError(undefined)
    Promise.all([fetchClaimAnalysis(claimId), fetchClaimDetail(claimId), fetchCaseTimeline(claimId)])
      .then(([analysisResponse, detailResponse, timelineResponse]) => {
        setAnalysis(analysisResponse)
        setDetail(detailResponse)
        setTimeline(timelineResponse)
        hydrateCaseForm(detailResponse)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [claimId, user?.employee_code, user?.username])

  useEffect(() => {
    if (!activeEvidence && !activeTimelineEvent) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActiveEvidence(null)
      if (event.key === 'Escape') setActiveTimelineEvent(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeEvidence, activeTimelineEvent])

  useEffect(() => {
    if (!canReview) return
    setReviewerId((current) => {
      if (current.trim()) return current
      return user?.employee_code || user?.username || ''
    })
  }, [canReview, user?.employee_code, user?.username])

  async function handleSubmitReview(event: FormEvent) {
    event.preventDefault()
    if (!claimId) return

    const reviewerValue = reviewerId.trim() || user?.employee_code || user?.username || ''
    if (!reviewerValue) {
      setError('Reviewer ID is required before submitting a disposition.')
      return
    }

    setError(undefined)
    setSubmittingReview(true)
    try {
      await submitReviewAction(claimId, {
        reviewer_id: reviewerValue,
        status,
        notes: notes || undefined,
        disposition_reason: dispositionReason || undefined
      })
      const normalizedStatus = status.toLowerCase()
      if (normalizedStatus === 'approved' || normalizedStatus === 'dismissed' || normalizedStatus === 'escalated') {
        navigate('/history')
      } else {
        navigate('/claims')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSubmittingReview(false)
    }
  }

  async function handleSaveCase(event: FormEvent) {
    event.preventDefault()
    if (!claimId) return

    setCaseSaving(true)
    setCaseMessage(undefined)
    setError(undefined)
    try {
      await updateCaseManagement(claimId, {
        case_owner_id: caseForm.ownerId.trim() || null,
        case_priority: caseForm.priority,
        case_sla_due_at: caseForm.slaDueAt ? new Date(caseForm.slaDueAt).toISOString() : null,
        case_tags: caseForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        case_watchlist: caseForm.watchlist,
        case_next_action: caseForm.nextAction.trim() || null
      })

      const [detailResponse, timelineResponse] = await Promise.all([
        fetchClaimDetail(claimId),
        fetchCaseTimeline(claimId)
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

  const claimProfileRows = [
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
    { label: 'Claim Amount', value: `${detail.claim_total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${detail.currency}` },
    { label: 'Status', value: detail.status },
    { label: 'Source Type', value: detail.source_type },
    { label: 'Source Reference', value: detail.source_reference },
    { label: 'Masked ID', value: detail.masked_id },
  ]

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

  return (
    <div className="app-page analysis-page">
      <CollapsiblePanel className="panel hero-panel">
        <div>
          <p className="eyebrow">Claim Investigation Workspace</p>
          <h2>Claim {analysis.claim_id}</h2>
          <p>
            Employee {analysis.employee_name} · Last updated {dayjs(detail.updated_at).format('DD MMM YYYY HH:mm')}
          </p>
        </div>
        <div className="hero-actions">
          <span className={severityClass(analysis.risk_level)}>{analysis.risk_level}</span>
          <strong>{analysis.risk_score.toFixed(1)} pts</strong>
          <Link className="text-link" to="/claims">Back to Workbench</Link>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel" title="Investigation Snapshot">
        <div className="metric-grid compact">
          <article className="metric-card">
            <div className="metric-line"><span>Primary Red Flag</span><RiskIcon className="metric-icon" /></div>
            <strong>{analysis.primary_red_flag ? formatDetectionType(analysis.primary_red_flag) : 'N/A'}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Suspicious Claim</span><RiskIcon className="metric-icon" /></div>
            <strong>{analysis.suspicious_flag ? 'Yes' : 'No'}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Incorrect Claim</span><WrongClaimIcon className="metric-icon" /></div>
            <strong>{analysis.incorrect_flag ? 'Yes' : 'No'}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Findings</span><AnalyzeIcon className="metric-icon" /></div>
            <strong>{analysis.findings.length}</strong>
          </article>
        </div>
      </CollapsiblePanel>

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
                  placeholder="executive review, hotel variance, policy exception"
                />
              </label>

              <label>
                Next Action
                <textarea
                  value={caseForm.nextAction}
                  onChange={(event) => setCaseForm((current) => ({ ...current, nextAction: event.target.value }))}
                  rows={3}
                  placeholder="Request hotel invoice, validate itinerary, escalate to HR business partner..."
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

      <CollapsiblePanel className="panel table-panel app-grow" allowFocusView>
        <h3 className="section-title"><AnalyzeIcon size={16} />Findings Matrix</h3>
        <div className="table-wrap table-fill-wrap">
          <table className="table professional-table">
            <thead>
              <tr>
                <th>Detection</th>
                <th>Severity</th>
                <th>Reason</th>
                <th>Policy</th>
                <th>Action</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {analysis.findings.map((finding) => (
                <tr key={`${finding.detection_type}-${finding.policy_reference || 'none'}`}>
                  <td>{formatDetectionType(finding.detection_type)}</td>
                  <td><span className={severityClass(finding.severity)}>{finding.severity}</span></td>
                  <td>{finding.reason}</td>
                  <td>{finding.policy_reference || '-'}</td>
                  <td>{finding.recommended_action}</td>
                  <td>{finding.risk_weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel two-col app-grow" allowFocusView>
        <article className="panel-scroll">
          <h3 className="section-title"><AnalyzeIcon size={16} />Evidence and Supporting Facts</h3>
          <div className="claim-profile-card">
            <h4>Claim Record Details</h4>
            <p className="muted-text">Business-friendly view of the imported claim row and key travel context.</p>
            <dl className="fact-grid">
              {claimProfileRows.map((row) => (
                <div key={row.label} className="fact-item">
                  <dt>{row.label}</dt>
                  <dd>{toFactValue(row.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
          {analysis.evidence_summary.map((evidence) => (
            <section key={evidence.detection_type} className="evidence-box">
              <div className="evidence-head">
                <h4>{formatDetectionType(evidence.detection_type)}</h4>
                <button className="small-btn" type="button" onClick={() => setActiveEvidence(evidence)}>
                  View technical JSON
                </button>
              </div>
              <dl className="fact-grid compact">
                {Object.entries(evidence.supporting_facts).map(([key, value]) => (
                  <div key={`${evidence.detection_type}-${key}`} className="fact-item">
                    <dt>{toFactLabel(key)}</dt>
                    <dd>{toFactValue(value)}</dd>
                  </div>
                ))}
              </dl>
              <div className="source-ref-list">
                {Object.entries(evidence.source_references).map(([key, value]) => (
                  <span key={`${evidence.detection_type}-src-${key}`} className="source-ref-pill">
                    {toFactLabel(key)}: {toFactValue(value)}
                  </span>
                ))}
              </div>
            </section>
          ))}
        </article>

        <article className="panel-scroll">
          <h3 className="section-title"><DocumentIcon size={16} />Source Documents</h3>
          <ul className="summary-list">
            {detail.documents.map((doc) => (
              <li key={doc.document_id}>
                <span>{doc.file_name}</span>
                <a href={getDocumentUrl(detail.claim_id, doc.document_id)} target="_blank" rel="noreferrer">Open</a>
              </li>
            ))}
          </ul>

          <h3 className="section-title"><ClaimsIcon size={16} />Recommended Actions</h3>
          <ul className="summary-list">
            {analysis.recommendations.length === 0 && <li><span>No recommendations yet.</span></li>}
            {analysis.recommendations.map((rec) => (
              <li key={rec}><span>{rec}</span></li>
            ))}
          </ul>
        </article>
      </CollapsiblePanel>

      {canReview && (
        <CollapsiblePanel className="panel">
          <h3 className="section-title"><RiskIcon size={16} />Reviewer Disposition</h3>
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
              Disposition Reason
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
