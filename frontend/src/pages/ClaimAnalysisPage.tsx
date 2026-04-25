import dayjs from 'dayjs'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchClaimAnalysis, fetchClaimDetail, getDocumentUrl, submitReviewAction } from '../api/client'
import { AnalyzeIcon, ClaimsIcon, DocumentIcon, RiskIcon, WrongClaimIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { useAuth } from '../context/AuthContext'
import { ClaimAnalysis, ClaimDetail } from '../types'
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

export function ClaimAnalysisPage() {
  const { claimId } = useParams<{ claimId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [analysis, setAnalysis] = useState<ClaimAnalysis>()
  const [detail, setDetail] = useState<ClaimDetail>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const [reviewerId, setReviewerId] = useState('')
  const [status, setStatus] = useState('under_review')
  const [notes, setNotes] = useState('')
  const [dispositionReason, setDispositionReason] = useState('')
  const [activeEvidence, setActiveEvidence] = useState<ClaimAnalysis['evidence_summary'][number] | null>(null)
  const [submittingReview, setSubmittingReview] = useState(false)

  const canReview = user?.role === 'reviewer' || user?.role === 'administrator'

  useEffect(() => {
    if (!claimId) return
    setLoading(true)
    setError(undefined)
    Promise.all([fetchClaimAnalysis(claimId), fetchClaimDetail(claimId)])
      .then(([analysisResponse, detailResponse]) => {
        setAnalysis(analysisResponse)
        setDetail(detailResponse)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [claimId])

  useEffect(() => {
    if (!activeEvidence) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActiveEvidence(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeEvidence])

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
    </div>
  )
}
