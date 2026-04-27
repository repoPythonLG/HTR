import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeClaim, fetchClaims } from '../api/client'
import { AnalyzeIcon, ClaimsIcon, DocumentIcon, RefreshIcon, RiskIcon, WrongClaimIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { ClaimSummary } from '../types'
import { formatDetectionType } from '../utils/formatters'

function riskChipClass(level?: string | null) {
  const normalized = (level || '').toLowerCase()
  if (normalized === 'critical') return 'chip critical'
  if (normalized === 'high') return 'chip high'
  if (normalized === 'medium') return 'chip medium'
  return 'chip low'
}

function priorityChipClass(priority?: string | null) {
  const value = (priority || 'standard').toLowerCase()
  if (value === 'executive') return 'chip critical'
  if (value === 'urgent') return 'chip high'
  if (value === 'priority') return 'chip medium'
  return 'chip low'
}

export function ClaimsWorkbenchPage() {
  const navigate = useNavigate()

  const [claims, setClaims] = useState<ClaimSummary[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [suspiciousOnly, setSuspiciousOnly] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [analyzingId, setAnalyzingId] = useState<string>()

  async function loadClaims() {
    setLoading(true)
    setError(undefined)
    try {
      const rows = await fetchClaims({ queue: 'active', status: statusFilter || undefined, suspiciousOnly })
      setClaims(rows)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClaims()
  }, [statusFilter, suspiciousOnly])

  async function handleAnalyzeAndOpen(claimId: string) {
    setAnalyzingId(claimId)
    setError(undefined)
    try {
      await analyzeClaim(claimId)
      navigate(`/claims/${claimId}/analysis`)
    } catch (err) {
      setError(String(err))
    } finally {
      setAnalyzingId(undefined)
      await loadClaims()
    }
  }

  const filteredClaims = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return claims.filter((claim) => {
      const level = (claim.risk_level || 'Unscored').toLowerCase()
      if (riskFilter && level !== riskFilter.toLowerCase()) {
        return false
      }

      if (!q) {
        return true
      }

      return (
        claim.claim_id.toLowerCase().includes(q) ||
        claim.employee_id.toLowerCase().includes(q) ||
        claim.employee_name.toLowerCase().includes(q) ||
        (claim.destination_city || '').toLowerCase().includes(q) ||
        (claim.trip_number || '').toLowerCase().includes(q)
      )
    })
  }, [claims, riskFilter, searchTerm])

  const kpi = useMemo(() => {
    const total = filteredClaims.length
    const suspicious = filteredClaims.filter((row) => row.suspicious_flag).length
    const incorrect = filteredClaims.filter((row) => row.incorrect_flag).length
    const averageRisk = total === 0 ? 0 : filteredClaims.reduce((sum, row) => sum + (row.risk_score || 0), 0) / total
    return {
      total,
      suspicious,
      incorrect,
      averageRisk: Number(averageRisk.toFixed(1))
    }
  }, [filteredClaims])

  return (
    <div className="app-page claims-workbench-page">
      <PageTabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            eyebrow: 'Queue',
            children: (
              <>
                <CollapsiblePanel className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Claims Workbench</h2>
                      <p>Review queue with suspicious-claim prioritization and analyst drilldown.</p>
                    </div>
                    <button onClick={() => loadClaims()}>
                      <span className="btn-inline"><RefreshIcon size={14} />Refresh Queue</span>
                    </button>
                  </div>
                  {loading && <div className="loading-bar" />}
                  {error && <div className="error-box">{error}</div>}
                </CollapsiblePanel>

                <CollapsiblePanel className="panel" title="Queue Summary">
                  <div className="metric-grid compact">
                    <article className="metric-card">
                      <div className="metric-line"><span>Claims in View</span><ClaimsIcon className="metric-icon" /></div>
                      <strong>{kpi.total}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Suspicious</span><RiskIcon className="metric-icon" /></div>
                      <strong>{kpi.suspicious}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Incorrect</span><WrongClaimIcon className="metric-icon" /></div>
                      <strong>{kpi.incorrect}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Average Risk</span><AnalyzeIcon className="metric-icon" /></div>
                      <strong>{kpi.averageRisk}</strong>
                    </article>
                  </div>
                </CollapsiblePanel>
              </>
            )
          },
          {
            id: 'queue',
            label: 'Claims Queue',
            eyebrow: 'Workbench',
            children: (
              <CollapsiblePanel className="panel claims-workbench-panel app-grow" allowFocusView>
                <div className="claims-workbench-controls">
                  <div className="toolbar">
                    <label>
                      Search claim / employee
                      <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Claim ID, employee ID, name, trip number" />
                    </label>

                    <label>
                      Status Filter
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">All</option>
                        <option value="uploaded">Uploaded</option>
                        <option value="analyzed">Analyzed</option>
                        <option value="under_review">Under Review</option>
                      </select>
                    </label>

                    <label>
                      Risk Filter
                      <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                        <option value="">All</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                        <option value="unscored">Unscored</option>
                      </select>
                    </label>

                    <label className="checkbox-inline">
                      <input type="checkbox" checked={suspiciousOnly} onChange={(e) => setSuspiciousOnly(e.target.checked)} />
                      Prioritize suspicious claims
                    </label>
                  </div>
                </div>

                <div className="table-wrap claims-workbench-table-wrap table-fill-wrap">
                  <table className="table professional-table">
                    <thead>
                      <tr>
                        <th>Claim</th>
                        <th>Employee</th>
                        <th>Destination</th>
                        <th>Trip Profile</th>
                        <th>Amount</th>
                        <th>Risk</th>
                        <th>Case</th>
                        <th>Flags</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClaims.length === 0 && (
                        <tr>
                          <td colSpan={10} className="empty-table">
                            No claims match your filters. Use the Data Intake window to upload a new spreadsheet.
                          </td>
                        </tr>
                      )}

                      {filteredClaims.map((claim) => (
                        <tr
                          key={claim.claim_id}
                          className={`${claim.suspicious_flag ? 'row-suspicious' : ''} ${claim.incorrect_flag ? 'row-incorrect' : ''}`}
                        >
                          <td>
                            <strong>{claim.claim_id}</strong>
                            <p>{claim.status}</p>
                            <p>{claim.trip_number || '-'}</p>
                          </td>
                          <td>
                            <strong>{claim.employee_name}</strong>
                            <p>{claim.employee_id}</p>
                          </td>
                          <td>
                            <p>{claim.destination_city || '-'}</p>
                            <p>{claim.to_country || '-'}</p>
                          </td>
                          <td>
                            <p>{claim.trip_activity || '-'}</p>
                            <p>{claim.trip_boundary || '-'}</p>
                            <p>{claim.trip_duration_days ? `${claim.trip_duration_days} day(s)` : '-'}</p>
                          </td>
                          <td>{claim.claim_total.toFixed(2)} {claim.currency}</td>
                          <td>
                            <span className={riskChipClass(claim.risk_level)}>{claim.risk_level || 'Unscored'}</span>
                            <p>{(claim.risk_score || 0).toFixed(1)} pts</p>
                          </td>
                          <td>
                            <span className={priorityChipClass(claim.case_priority)}>{claim.case_priority || 'standard'}</span>
                            <p>{claim.case_owner_id || 'Unassigned'}</p>
                            <p>{claim.case_sla_due_at ? `SLA ${dayjs(claim.case_sla_due_at).format('DD MMM HH:mm')}` : 'No SLA'}</p>
                            {claim.case_watchlist && <p>Watchlist</p>}
                          </td>
                          <td>
                            <p>Detections: {claim.detection_count}</p>
                            <p>{claim.primary_red_flag ? formatDetectionType(claim.primary_red_flag) : '-'}</p>
                          </td>
                          <td>{dayjs(claim.created_at).format('DD MMM YYYY HH:mm')}</td>
                          <td>
                            <div className="actions-inline">
                              <button className="small-btn" onClick={() => navigate(`/claims/${claim.claim_id}/analysis`)}>
                                <span className="btn-inline"><DocumentIcon size={13} />Open</span>
                              </button>
                              <button className="small-btn" onClick={() => handleAnalyzeAndOpen(claim.claim_id)} disabled={analyzingId === claim.claim_id}>
                                <span className="btn-inline"><AnalyzeIcon size={13} />{analyzingId === claim.claim_id ? 'Analyzing...' : 'Analyze'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsiblePanel>
            )
          }
        ]}
      />
    </div>
  )
}
