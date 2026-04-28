import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchReceipts } from '../api/client'
import { ReceiptsIcon, DocumentIcon, RefreshIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
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

  const [receipts, setReceipts] = useState<ClaimSummary[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  async function loadReceipts() {
    setLoading(true)
    setError(undefined)
    try {
      const rows = await fetchReceipts({ queue: 'history', status: statusFilter || undefined })
      setReceipts(rows)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReceipts()
  }, [statusFilter])

  const filteredReceipts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return receipts

    return receipts.filter((receipt) => (
      receipt.receipt_id.toLowerCase().includes(q) ||
      receipt.employee_id.toLowerCase().includes(q) ||
      receipt.employee_name.toLowerCase().includes(q) ||
      (receipt.destination_city || '').toLowerCase().includes(q) ||
      (receipt.trip_number || '').toLowerCase().includes(q)
    ))
  }, [receipts, searchTerm])

  const reviewedCount = receipts.filter((item) => item.status === 'reviewed').length
  const escalatedCount = receipts.filter((item) => item.status === 'escalated').length

  return (
    <div className="app-page receipts-workbench-page">
      <PageTabs
        defaultTabId="records"
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            eyebrow: 'History',
            children: (
              <>
                <CollapsiblePanel className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Processed Entry History</h2>
                      <p>Decisioned travel expense entries are stored here and excluded from the active risk workbench and dashboards.</p>
                    </div>
                    <button onClick={() => loadReceipts()}>
                      <span className="btn-inline"><RefreshIcon size={14} />Refresh History</span>
                    </button>
                  </div>
                  {loading && <div className="loading-bar" />}
                  {error && <div className="error-box">{error}</div>}
                </CollapsiblePanel>

                <CollapsiblePanel className="panel" title="History Summary">
                  <div className="metric-grid compact">
                    <article className="metric-card">
                      <div className="metric-line"><span>Total Processed</span><ReceiptsIcon className="metric-icon" /></div>
                      <strong>{receipts.length}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Reviewed</span><ReceiptsIcon className="metric-icon" /></div>
                      <strong>{reviewedCount}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Escalated</span><ReceiptsIcon className="metric-icon" /></div>
                      <strong>{escalatedCount}</strong>
                    </article>
                  </div>
                </CollapsiblePanel>
              </>
            )
          },
          {
            id: 'records',
            label: 'History Records',
            eyebrow: 'Archive',
            children: (
              <CollapsiblePanel className="panel receipts-workbench-panel app-grow" allowFocusView>
                <div className="receipts-workbench-controls">
                  <div className="toolbar">
                    <label>
                      Search entry / employee
                      <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Entry ID, employee ID, name, trip number" />
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
                </div>

                <div className="table-wrap receipts-workbench-table-wrap table-fill-wrap">
                  <table className="table professional-table">
                    <thead>
                      <tr>
                        <th>Entry</th>
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
                      {filteredReceipts.length === 0 && (
                        <tr>
                          <td colSpan={9} className="empty-table">No processed travel expense entries match your filters.</td>
                        </tr>
                      )}

                      {filteredReceipts.map((receipt) => (
                        <tr key={receipt.receipt_id}>
                          <td>
                            <strong>{receipt.receipt_id}</strong>
                            <p>{receipt.trip_number || '-'}</p>
                          </td>
                          <td>
                            <strong>{receipt.employee_name}</strong>
                            <p>{receipt.employee_id}</p>
                          </td>
                          <td>
                            <p>{receipt.destination_city || '-'}</p>
                            <p>{receipt.to_country || '-'}</p>
                          </td>
                          <td>
                            <p>{receipt.trip_activity || '-'}</p>
                            <p>{receipt.trip_boundary || '-'}</p>
                          </td>
                          <td>{receipt.receipt_total.toFixed(2)} {receipt.currency}</td>
                          <td><span className={statusChipClass(receipt.status)}>{receipt.status}</span></td>
                          <td>
                            <span className={priorityChipClass(receipt.case_priority)}>{receipt.case_priority || 'standard'}</span>
                            <p>{receipt.case_owner_id || 'Unassigned'}</p>
                            <p>{receipt.case_closed_at ? `Closed ${dayjs(receipt.case_closed_at).format('DD MMM HH:mm')}` : 'Closure pending'}</p>
                          </td>
                          <td>{dayjs(receipt.created_at).format('DD MMM YYYY HH:mm')}</td>
                          <td>
                            <button className="small-btn" onClick={() => navigate(`/receipts/${receipt.receipt_id}/analysis`)}>
                              <span className="btn-inline"><DocumentIcon size={13} />Open</span>
                            </button>
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
