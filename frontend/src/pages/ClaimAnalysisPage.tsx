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

  async function handleSubmitReview(event: FormEvent) {
    event.preventDefault()
    if (!claimId || !reviewerId) return
    setError(undefined)
    try {
      await submitReviewAction(claimId, {
        reviewer_id: reviewerId,
        status,
        notes: notes || undefined,
        disposition_reason: dispositionReason || undefined
      })
      navigate('/claims')
    } catch (err) {
      setError(String(err))
    }
  }

  if (loading) return <div className="panel">Loading analysis window...</div>
  if (error) return <div className="error-box">{error}</div>
  if (!analysis || !detail) return <div className="panel">No analysis data available.</div>

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
          {analysis.evidence_summary.map((evidence) => (
            <details key={evidence.detection_type} className="evidence-box" open>
              <summary>{formatDetectionType(evidence.detection_type)}</summary>
              <pre>{JSON.stringify(evidence.supporting_facts, null, 2)}</pre>
              <pre>{JSON.stringify(evidence.source_references, null, 2)}</pre>
            </details>
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
                <input value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} placeholder="REV-101" />
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

            <button type="submit"><span className="btn-inline"><AnalyzeIcon size={14} />Submit Decision</span></button>
          </form>
        </CollapsiblePanel>
      )}
    </div>
  )
}
