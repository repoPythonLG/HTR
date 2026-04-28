import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchReceiptPage } from '../api/client'
import { ReceiptsIcon, DocumentIcon, RefreshIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { ClaimSummary } from '../types'

function statusChipClass(status: string) {
  const value = status.toLowerCase()
  if (value === 'approved' || value === 'reviewed' || value === 'completed') return 'chip low'
  if (value === 'dismissed') return 'chip medium'
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

function useDebouncedValue(value: string, delayMs = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(handle)
  }, [value, delayMs])

  return debouncedValue
}

export function ProcessedClaimsHistoryPage() {
  const navigate = useNavigate()

  const [receipts, setReceipts] = useState<ClaimSummary[]>([])
  const [totalReceipts, setTotalReceipts] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebouncedValue(searchTerm)
  const [pageSize, setPageSize] = useState(50)
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const loadReceipts = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const page = await fetchReceiptPage({
        queue: 'history',
        status: statusFilter || undefined,
        search: debouncedSearchTerm.trim() || undefined,
        sortBy: 'created_desc',
        limit: pageSize,
        offset: pageIndex * pageSize
      })
      setReceipts(page.items)
      setTotalReceipts(page.total)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [debouncedSearchTerm, pageIndex, pageSize, statusFilter])

  function resetToFirstPage() {
    setPageIndex(0)
  }

  useEffect(() => {
    loadReceipts()
  }, [loadReceipts])

  useEffect(() => {
    resetToFirstPage()
  }, [debouncedSearchTerm])

  const historySummary = useMemo(() => {
    const approved = receipts.filter((item) => ['approved', 'reviewed', 'completed'].includes(item.status.toLowerCase())).length
    const dismissed = receipts.filter((item) => item.status.toLowerCase() === 'dismissed').length
    const escalated = receipts.filter((item) => item.status.toLowerCase() === 'escalated').length
    return { approved, dismissed, escalated }
  }, [receipts])

  const showingFrom = totalReceipts === 0 ? 0 : pageIndex * pageSize + 1
  const showingTo = Math.min(totalReceipts, pageIndex * pageSize + receipts.length)
  const totalPages = Math.max(1, Math.ceil(totalReceipts / pageSize))

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
                      <strong>{totalReceipts}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Approved On Page</span><ReceiptsIcon className="metric-icon" /></div>
                      <strong>{historySummary.approved}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Dismissed On Page</span><ReceiptsIcon className="metric-icon" /></div>
                      <strong>{historySummary.dismissed}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Escalated On Page</span><ReceiptsIcon className="metric-icon" /></div>
                      <strong>{historySummary.escalated}</strong>
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
              <CollapsiblePanel className="panel receipts-history-panel app-grow" allowFocusView>
                <div className="receipts-workbench-controls">
                  <div className="toolbar">
                    <label>
                      Search entry / employee
                      <input value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); resetToFirstPage() }} placeholder="Entry ID, employee ID, name, trip number" />
                    </label>

                    <label>
                      History Status
                      <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetToFirstPage() }}>
                        <option value="">All processed</option>
                        <option value="approved">Approved</option>
                        <option value="dismissed">Dismissed</option>
                        <option value="reviewed">Legacy Reviewed</option>
                        <option value="escalated">Escalated</option>
                        <option value="completed">Completed</option>
                      </select>
                    </label>

                    <label>
                      Rows
                      <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); resetToFirstPage() }}>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="queue-page-strip">
                  <span>
                    {loading
                      ? 'Loading processed history...'
                      : `Showing ${showingFrom}-${showingTo} of ${totalReceipts} processed entries`}
                  </span>
                  <div className="pagination-controls">
                    <button className="small-btn" disabled={pageIndex === 0 || loading} onClick={() => setPageIndex((page) => Math.max(0, page - 1))}>
                      Previous
                    </button>
                    <strong>Page {pageIndex + 1} of {totalPages}</strong>
                    <button className="small-btn" disabled={pageIndex + 1 >= totalPages || loading} onClick={() => setPageIndex((page) => page + 1)}>
                      Next
                    </button>
                  </div>
                </div>

                {error && <div className="error-box">{error}</div>}

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
                      {receipts.length === 0 && (
                        <tr>
                          <td colSpan={9} className="empty-table">No processed travel expense entries match your filters.</td>
                        </tr>
                      )}

                      {receipts.map((receipt) => (
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
