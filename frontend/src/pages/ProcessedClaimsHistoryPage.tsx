import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchClaims } from '../api/client'
import { ClaimsIcon, DocumentIcon, RefreshIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { ClaimSummary } from '../types'

function statusChipClass(status: string) {
  const value = status.toLowerCase()
  if (value === 'reviewed') return 'chip low'
  if (value === 'escalated') return 'chip high'
  return 'chip medium'
}

function priorityChipClass(priority?: string | null) {
  const value = (priority || 'standard').toLowerCase()
  if (value === 'executive') return 'chip critical'
  if (value === 'urgent') return 'chip high'
  if (value === 'priority') return 'chip medium'
  return 'chip low'
}

export function ProcessedClaimsHistoryPage() {
  const navigate = useNavigate()

  const [claims, setClaims] = useState<ClaimSummary[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  async function loadClaims() {
    setLoading(true)
    setError(undefined)
    try {
      const rows = await fetchClaims({ queue: 'history', status: statusFilter || undefined })
      setClaims(rows)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClaims()
  }, [statusFilter])

  const filteredClaims = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return claims

    return claims.filter((claim) => (
      claim.claim_id.toLowerCase().includes(q) ||
      claim.employee_id.toLowerCase().includes(q) ||
      claim.employee_name.toLowerCase().includes(q) ||
      (claim.destination_city || '').toLowerCase().includes(q) ||
      (claim.trip_number || '').toLowerCase().includes(q)
    ))
  }, [claims, searchTerm])

  const reviewedCount = claims.filter((item) => item.status === 'reviewed').length
  const escalatedCount = claims.filter((item) => item.status === 'escalated').length

  return (
    <div className="app-page claims-workbench-page">
      <CollapsiblePanel className="panel claims-workbench-panel app-grow" allowFocusView>
        <div className="claims-workbench-controls">
          <div className="panel-head">
            <div>
              <h2>Processed Claims History</h2>
              <p>Dispositioned claims are stored here and excluded from the active risk workbench and dashboards.</p>
            </div>
            <button onClick={() => loadClaims()}>
              <span className="btn-inline"><RefreshIcon size={14} />Refresh History</span>
            </button>
          </div>

          <div className="metric-grid compact">
            <article className="metric-card">
              <div className="metric-line"><span>Total Processed</span><ClaimsIcon className="metric-icon" /></div>
              <strong>{claims.length}</strong>
            </article>
            <article className="metric-card">
              <div className="metric-line"><span>Reviewed</span><ClaimsIcon className="metric-icon" /></div>
              <strong>{reviewedCount}</strong>
            </article>
            <article className="metric-card">
              <div className="metric-line"><span>Escalated</span><ClaimsIcon className="metric-icon" /></div>
              <strong>{escalatedCount}</strong>
            </article>
          </div>

          <div className="toolbar">
            <label>
              Search claim / employee
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Claim ID, employee ID, name, trip number"
              />
            </label>

            <label>
              History Status
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All processed</option>
                <option value="reviewed">Reviewed</option>
                <option value="escalated">Escalated</option>
              </select>
            </label>
          </div>

          {loading && <div className="loading-bar" />}
          {error && <div className="error-box">{error}</div>}
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
                <th>Final Status</th>
                <th>Case File</th>
                <th>Filed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaims.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-table">
                    No processed claims match your filters.
                  </td>
                </tr>
              )}

              {filteredClaims.map((claim) => (
                <tr key={claim.claim_id}>
                  <td>
                    <strong>{claim.claim_id}</strong>
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
                  </td>
                  <td>{claim.claim_total.toFixed(2)} {claim.currency}</td>
                  <td><span className={statusChipClass(claim.status)}>{claim.status}</span></td>
                  <td>
                    <span className={priorityChipClass(claim.case_priority)}>{claim.case_priority || 'standard'}</span>
                    <p>{claim.case_owner_id || 'Unassigned'}</p>
                    <p>{claim.case_closed_at ? `Closed ${dayjs(claim.case_closed_at).format('DD MMM HH:mm')}` : 'Closure pending'}</p>
                  </td>
                  <td>{dayjs(claim.created_at).format('DD MMM YYYY HH:mm')}</td>
                  <td>
                    <button className="small-btn" onClick={() => navigate(`/claims/${claim.claim_id}/analysis`)}>
                      <span className="btn-inline"><DocumentIcon size={13} />Open</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsiblePanel>
    </div>
  )
}
