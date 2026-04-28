import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeClaim, fetchReceiptPage } from '../api/client'
import { AnalyzeIcon, ReceiptsIcon, DocumentIcon, RefreshIcon, RiskIcon, WrongClaimIcon } from '../components/BrandIcons'
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

function useDebouncedValue(value: string, delayMs = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(handle)
  }, [value, delayMs])

  return debouncedValue
}

export function ClaimsWorkbenchPage() {
  const navigate = useNavigate()

  const [receipts, setReceipts] = useState<ClaimSummary[]>([])
  const [totalReceipts, setTotalReceipts] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [suspiciousOnly, setSuspiciousOnly] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebouncedValue(searchTerm)
  const [sortBy, setSortBy] = useState('risk_desc')
  const [pageSize, setPageSize] = useState(50)
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [analyzingId, setAnalyzingId] = useState<string>()

  const loadReceipts = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const page = await fetchReceiptPage({
        queue: 'active',
        status: statusFilter || undefined,
        suspiciousOnly,
        riskLevel: riskFilter || undefined,
        search: debouncedSearchTerm.trim() || undefined,
        sortBy,
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
  }, [debouncedSearchTerm, pageIndex, pageSize, riskFilter, sortBy, statusFilter, suspiciousOnly])

  useEffect(() => {
    setPageIndex(0)
  }, [debouncedSearchTerm])

  useEffect(() => {
    loadReceipts()
  }, [loadReceipts])

  async function handleAnalyzeAndOpen(receiptId: string) {
    setAnalyzingId(receiptId)
    setError(undefined)
    try {
      await analyzeClaim(receiptId)
      navigate(`/receipts/${receiptId}/analysis`)
    } catch (err) {
      setError(String(err))
    } finally {
      setAnalyzingId(undefined)
      await loadReceipts()
    }
  }

  const kpi = useMemo(() => {
    const visible = receipts.length
    const suspicious = receipts.filter((row) => row.suspicious_flag).length
    const incorrect = receipts.filter((row) => row.incorrect_flag).length
    const averageRisk = visible === 0 ? 0 : receipts.reduce((sum, row) => sum + (row.risk_score || 0), 0) / visible
    return {
      total: totalReceipts,
      visible,
      suspicious,
      incorrect,
      averageRisk: Number(averageRisk.toFixed(1))
    }
  }, [receipts, totalReceipts])

  const showingFrom = totalReceipts === 0 ? 0 : pageIndex * pageSize + 1
  const showingTo = Math.min(totalReceipts, pageIndex * pageSize + receipts.length)
  const totalPages = Math.max(1, Math.ceil(totalReceipts / pageSize))

  function resetToFirstPage() {
    setPageIndex(0)
  }

  return (
    <div className="app-page receipts-workbench-page">
      <PageTabs
        defaultTabId="queue"
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
                      <h2>Travel Expense Entry Workbench</h2>
                      <p>Review queue with suspicious-entry prioritization and analyst drilldown.</p>
                    </div>
                    <button onClick={() => loadReceipts()}>
                      <span className="btn-inline"><RefreshIcon size={14} />Refresh Queue</span>
                    </button>
                  </div>
                  {loading && <div className="loading-bar" />}
                  {error && <div className="error-box">{error}</div>}
                </CollapsiblePanel>

                <CollapsiblePanel className="panel" title="Queue Summary">
                  <div className="metric-grid compact">
                    <article className="metric-card">
                      <div className="metric-line"><span>Matching Entries</span><ReceiptsIcon className="metric-icon" /></div>
                      <strong>{kpi.total}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Loaded Page</span><ReceiptsIcon className="metric-icon" /></div>
                      <strong>{kpi.visible}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Suspicious On Page</span><RiskIcon className="metric-icon" /></div>
                      <strong>{kpi.suspicious}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Incorrect On Page</span><WrongClaimIcon className="metric-icon" /></div>
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
            label: 'Travel Expense Entries',
            eyebrow: 'Workbench',
            children: (
              <CollapsiblePanel className="panel receipts-workbench-panel app-grow" allowFocusView>
                <div className="receipts-workbench-controls">
                  <div className="toolbar">
                    <label>
                      Search entry / employee
                      <input value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); resetToFirstPage() }} placeholder="Entry ID, employee ID, name, trip number" />
                    </label>

                    <label>
                      Status Filter
                      <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetToFirstPage() }}>
                        <option value="">All</option>
                        <option value="uploaded">Uploaded</option>
                        <option value="analyzed">Analyzed</option>
                        <option value="under_review">Under Review</option>
                      </select>
                    </label>

                    <label>
                      Risk Filter
                      <select value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); resetToFirstPage() }}>
                        <option value="">All</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                        <option value="unscored">Unscored</option>
                      </select>
                    </label>

                    <label>
                      Sort Order
                      <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); resetToFirstPage() }}>
                        <option value="risk_desc">Highest risk first</option>
                        <option value="risk_asc">Lowest risk first</option>
                        <option value="created_desc">Newest first</option>
                        <option value="created_asc">Oldest first</option>
                        <option value="amount_desc">Highest amount first</option>
                        <option value="amount_asc">Lowest amount first</option>
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

                    <label className="checkbox-inline">
                      <input type="checkbox" checked={suspiciousOnly} onChange={(e) => { setSuspiciousOnly(e.target.checked); resetToFirstPage() }} />
                      Show suspicious only
                    </label>
                  </div>
                </div>

                <div className="queue-page-strip">
                  <span>
                    {loading
                      ? 'Loading entry queue...'
                      : `Showing ${showingFrom}-${showingTo} of ${totalReceipts} matching entries`}
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

                <div className="table-wrap receipts-workbench-table-wrap table-fill-wrap">
                  <table className="table professional-table">
                    <thead>
                      <tr>
                        <th>Entry</th>
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
                      {receipts.length === 0 && (
                        <tr>
                          <td colSpan={10} className="empty-table">
                            No travel expense entries match your filters. Use the Data Intake window to upload a new spreadsheet.
                          </td>
                        </tr>
                      )}

                      {receipts.map((receipt) => (
                        <tr
                          key={receipt.receipt_id}
                          className={`${receipt.suspicious_flag ? 'row-suspicious' : ''} ${receipt.incorrect_flag ? 'row-incorrect' : ''}`}
                        >
                          <td>
                            <strong>{receipt.receipt_id}</strong>
                            <p>{receipt.status}</p>
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
                            <p>{receipt.trip_duration_days ? `${receipt.trip_duration_days} day(s)` : '-'}</p>
                          </td>
                          <td>{receipt.receipt_total.toFixed(2)} {receipt.currency}</td>
                          <td>
                            <span className={riskChipClass(receipt.risk_level)}>{receipt.risk_level || 'Unscored'}</span>
                            <p>{(receipt.risk_score || 0).toFixed(1)} pts</p>
                          </td>
                          <td>
                            <span className={priorityChipClass(receipt.case_priority)}>{receipt.case_priority || 'standard'}</span>
                            <p>{receipt.case_owner_id || 'Unassigned'}</p>
                            <p>{receipt.case_sla_due_at ? `SLA ${dayjs(receipt.case_sla_due_at).format('DD MMM HH:mm')}` : 'No SLA'}</p>
                            {receipt.case_watchlist && <p>Watchlist</p>}
                          </td>
                          <td>
                            <p>Detections: {receipt.detection_count}</p>
                            <p>{receipt.primary_red_flag ? formatDetectionType(receipt.primary_red_flag) : '-'}</p>
                          </td>
                          <td>{dayjs(receipt.created_at).format('DD MMM YYYY HH:mm')}</td>
                          <td>
                            <div className="actions-inline">
                              <button className="small-btn" onClick={() => navigate(`/receipts/${receipt.receipt_id}/analysis`)}>
                                <span className="btn-inline"><DocumentIcon size={13} />Open</span>
                              </button>
                              <button className="small-btn" onClick={() => handleAnalyzeAndOpen(receipt.receipt_id)} disabled={analyzingId === receipt.receipt_id}>
                                <span className="btn-inline"><AnalyzeIcon size={13} />{analyzingId === receipt.receipt_id ? 'Analyzing...' : 'Analyze'}</span>
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
