import dayjs from 'dayjs'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { analyzeClaim, fetchEmployeeDashboard, fetchReceiptPage, uploadClaimPack } from '../api/client'
import { AnalyzeIcon, ReceiptsIcon, EmployeeIcon, RiskIcon, UploadIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { useAuth } from '../context/AuthContext'
import { ClaimSummary, EmployeeDashboard } from '../types'
import { formatDetectionType } from '../utils/formatters'

const currencyFormatter = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type EmployeeSubmissionForm = {
  employeeId: string
  employeeName: string
  department: string
  tripNumber: string
  tripActivity: string
  tripBoundary: string
  destinationCity: string
  destinationCountry: string
  startDate: string
  endDate: string
  settlementDate: string
  expenseType: string
  amount: string
  currency: string
}

const initialSubmissionForm: EmployeeSubmissionForm = {
  employeeId: '',
  employeeName: '',
  department: 'Travel',
  tripNumber: '',
  tripActivity: 'Business Trip',
  tripBoundary: 'International',
  destinationCity: '',
  destinationCountry: '',
  startDate: '',
  endDate: '',
  settlementDate: '',
  expenseType: 'Business Housing Claim',
  amount: '',
  currency: 'SAR'
}

function riskChipClass(level?: string | null) {
  const value = (level || 'unscored').toLowerCase()
  if (value === 'critical') return 'chip critical'
  if (value === 'high') return 'chip high'
  if (value === 'medium') return 'chip medium'
  if (value === 'low') return 'chip low'
  return 'chip neutral'
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function EmployeeViewPage() {
  const { user } = useAuth()

  const [data, setData] = useState<EmployeeDashboard>()
  const [submissions, setSubmissions] = useState<ClaimSummary[]>([])
  const [submissionTotal, setSubmissionTotal] = useState(0)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<EmployeeSubmissionForm>(() => ({
    ...initialSubmissionForm,
    employeeId: user?.employee_code || 'EMP-1001',
    employeeName: user?.full_name || 'Employee User'
  }))
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([])

  const refreshEmployeeData = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [dashboard, submissionPage] = await Promise.all([
        fetchEmployeeDashboard(),
        fetchReceiptPage({ queue: 'all', sortBy: 'created_desc', limit: 100, offset: 0 })
      ])
      setData(dashboard)
      setSubmissions(submissionPage.items)
      setSubmissionTotal(submissionPage.total)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setForm((current) => ({
      ...current,
      employeeId: current.employeeId || user?.employee_code || 'EMP-1001',
      employeeName: current.employeeName || user?.full_name || 'Employee User'
    }))
  }, [user?.employee_code, user?.full_name])

  useEffect(() => {
    refreshEmployeeData()
  }, [refreshEmployeeData])

  const pendingCount = useMemo(() => submissions.filter((item) => ['uploaded', 'under_review'].includes(item.status)).length, [submissions])
  const documentBackedCount = useMemo(() => submissions.filter((item) => item.source_type === 'document_upload').length, [submissions])

  function updateForm<K extends keyof EmployeeSubmissionForm>(key: K, value: EmployeeSubmissionForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmitEntry(event: FormEvent) {
    event.preventDefault()
    const employeeId = form.employeeId.trim()
    if (!employeeId) {
      setError('Employee ID is required before submitting the entry.')
      return
    }
    if (!invoiceFiles.length) {
      setError('Attach at least one invoice or receipt document before submitting the entry.')
      return
    }

    setSubmitting(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const upload = await uploadClaimPack({
        employee_id: employeeId,
        employee_name: form.employeeName.trim() || user?.full_name || employeeId,
        department: form.department.trim() || 'Travel',
        trip_number: form.tripNumber.trim() || undefined,
        trip_activity: form.tripActivity,
        trip_boundary: form.tripBoundary,
        to_country: form.destinationCountry.trim() || undefined,
        destination_city: form.destinationCity.trim() || undefined,
        start_date: form.startDate || undefined,
        end_date: form.endDate || undefined,
        trip_settlement_date: form.settlementDate || undefined,
        expense_type: form.expenseType.trim() || 'Business Housing Claim',
        claim_total: form.amount,
        currency: form.currency.trim() || 'SAR',
        files: invoiceFiles
      })

      try {
        await analyzeClaim(upload.receipt_id)
      } catch {
        // The record is still valid even if immediate analysis is unavailable.
      }

      setMessage(`Entry ${upload.receipt_id} was submitted, stored in the database, and linked to ${upload.document_count} invoice file(s).`)
      setForm({ ...initialSubmissionForm, employeeId, employeeName: form.employeeName.trim() || user?.full_name || 'Employee User' })
      setInvoiceFiles([])
      await refreshEmployeeData()
    } catch (err) {
      setError(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !data) return <div className="error-box">{error}</div>
  if (!data) return <div className="panel">Loading employee view...</div>

  return (
    <div className="app-page employee-page">
      <PageTabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            eyebrow: 'Employee',
            children: (
              <>
                <CollapsiblePanel className="panel employee-hero-panel">
                  <div>
                    <p className="eyebrow">Employee self-service workspace</p>
                    <h2 className="section-title"><EmployeeIcon size={18} />My Travel Expense Entries</h2>
                    <p className="muted-text">Submit invoices, create travel expense records, and track what is stored in the review database.</p>
                  </div>
                  <button type="button" onClick={refreshEmployeeData} disabled={loading}>Refresh records</button>
                </CollapsiblePanel>

                <CollapsiblePanel className="panel">
                  <div className="metric-grid">
                    <article className="metric-card">
                      <div className="metric-line"><span>Demo Profile</span><EmployeeIcon className="metric-icon" /></div>
                      <strong>{data.employee_id}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Total Entries</span><ReceiptsIcon className="metric-icon" /></div>
                      <strong>{data.total_receipts}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Pending Review</span><RiskIcon className="metric-icon" /></div>
                      <strong>{pendingCount}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Analyzed</span><AnalyzeIcon className="metric-icon" /></div>
                      <strong>{data.analyzed_receipts}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Flagged</span><RiskIcon className="metric-icon" /></div>
                      <strong>{data.suspicious_receipts}</strong>
                    </article>
                    <article className="metric-card">
                      <div className="metric-line"><span>Invoice-Backed</span><UploadIcon className="metric-icon" /></div>
                      <strong>{documentBackedCount}</strong>
                    </article>
                  </div>
                </CollapsiblePanel>
              </>
            )
          },
          {
            id: 'submit',
            label: 'Submit Entry',
            eyebrow: 'Invoices',
            children: (
              <CollapsiblePanel className="panel employee-submit-panel app-grow" title="Submit Travel Expense Entry" allowFocusView>
                <form className="employee-submit-form" onSubmit={handleSubmitEntry}>
                  <div className="employee-submit-intro">
                    <div>
                      <p className="eyebrow">New database record</p>
                      <h3 className="section-title"><UploadIcon size={16} />Create Travel Expense Entry</h3>
                    <p className="muted-text">This creates a row in the travel expense table and attaches uploaded invoices as supporting evidence.</p>
                    </div>
                    <span className="source-ref-pill">Demo employee submission</span>
                  </div>

                  {message && <div className="success-box">{message}</div>}
                  {error && <div className="error-box">{error}</div>}

                  <div className="employee-form-grid">
                    <label>Employee ID<input value={form.employeeId} onChange={(event) => updateForm('employeeId', event.target.value)} required /></label>
                    <label>Employee Name<input value={form.employeeName} onChange={(event) => updateForm('employeeName', event.target.value)} /></label>
                    <label>Department<input value={form.department} onChange={(event) => updateForm('department', event.target.value)} /></label>
                    <label>Trip Number<input value={form.tripNumber} onChange={(event) => updateForm('tripNumber', event.target.value)} placeholder="Optional" /></label>
                    <label>Trip Activity
                      <select value={form.tripActivity} onChange={(event) => updateForm('tripActivity', event.target.value)}>
                        <option>Business Trip</option>
                        <option>Training</option>
                        <option>Conference</option>
                        <option>Client Visit</option>
                      </select>
                    </label>
                    <label>Trip Boundary
                      <select value={form.tripBoundary} onChange={(event) => updateForm('tripBoundary', event.target.value)}>
                        <option>Domestic</option>
                        <option>International</option>
                      </select>
                    </label>
                    <label>Destination City<input value={form.destinationCity} onChange={(event) => updateForm('destinationCity', event.target.value)} required /></label>
                    <label>Destination Country<input value={form.destinationCountry} onChange={(event) => updateForm('destinationCountry', event.target.value)} required /></label>
                    <label>Start Date<input type="date" value={form.startDate} onChange={(event) => updateForm('startDate', event.target.value)} required /></label>
                    <label>End Date<input type="date" value={form.endDate} onChange={(event) => updateForm('endDate', event.target.value)} required /></label>
                    <label>Settlement Date<input type="date" value={form.settlementDate} onChange={(event) => updateForm('settlementDate', event.target.value)} /></label>
                    <label>Expense Type<input value={form.expenseType} onChange={(event) => updateForm('expenseType', event.target.value)} /></label>
                    <label>Travel Expense Amount<input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => updateForm('amount', event.target.value)} required /></label>
                    <label>Currency<input value={form.currency} onChange={(event) => updateForm('currency', event.target.value.toUpperCase())} /></label>
                  </div>

                  <label className="employee-file-drop">
                    <span className="document-list-icon"><UploadIcon size={20} /></span>
                    <span>
                      <strong>Attach invoices and supporting receipts</strong>
                      <small>PDF, image, text, or spreadsheet evidence. These files are stored with the DB record.</small>
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.xls"
                      onChange={(event) => {
                        const selected = Array.from(event.target.files || [])
                        setInvoiceFiles((current) => {
                          const seen = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`))
                          const next = [...current]
                          for (const file of selected) {
                            const key = `${file.name}-${file.size}-${file.lastModified}`
                            if (seen.has(key)) continue
                            seen.add(key)
                            next.push(file)
                          }
                          return next
                        })
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>

                  {invoiceFiles.length > 0 && (
                    <div className="employee-file-list">
                      {invoiceFiles.map((file, index) => (
                        <span key={`${file.name}-${file.size}-${file.lastModified}`}>
                          {file.name}
                          <button
                            type="button"
                            aria-label={`Remove ${file.name}`}
                            onClick={() => setInvoiceFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                          >
                            Remove
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <button type="submit" disabled={submitting || !form.employeeId.trim()}>
                    <span className="btn-inline"><UploadIcon size={14} />{submitting ? 'Submitting...' : 'Submit Entry and Invoices'}</span>
                  </button>
                </form>
              </CollapsiblePanel>
            )
          },
          {
            id: 'submissions',
            label: 'My Submissions',
            eyebrow: 'Records',
            children: (
              <CollapsiblePanel className="panel table-panel app-grow employee-submissions-panel" title="My Database Records" allowFocusView>
                <div className="queue-page-strip">
                  <span>{loading ? 'Loading submissions...' : `Showing ${submissions.length} of ${submissionTotal} stored entries for ${data.employee_id}`}</span>
                  <button className="small-btn" onClick={refreshEmployeeData} disabled={loading}>Refresh</button>
                </div>
                <div className="table-wrap table-fill-wrap employee-submissions-table-wrap">
                  <table className="table professional-table">
                    <thead>
                      <tr>
                        <th>Entry</th>
                        <th>Employee</th>
                        <th>Destination</th>
                        <th>Trip</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Risk</th>
                        <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                      {submissions.length === 0 && (
                        <tr>
                          <td colSpan={8} className="empty-table">No employee travel expense entries are stored yet. Submit an entry with invoices to create the first record.</td>
                        </tr>
                      )}
                      {submissions.map((receipt) => (
                        <tr key={receipt.receipt_id} className={receipt.suspicious_flag ? 'row-suspicious' : ''}>
                          <td>
                            <strong>{receipt.trip_number || receipt.receipt_id}</strong>
                            <p>{receipt.receipt_id}</p>
                          </td>
                          <td>
                            <strong>{receipt.employee_name}</strong>
                            <p>{receipt.employee_id}</p>
                          </td>
                          <td>
                            <p>{receipt.destination_city || receipt.to_city || '-'}</p>
                            <p>{receipt.to_country || '-'}</p>
                          </td>
                          <td>
                            <p>{receipt.trip_activity || '-'}</p>
                            <p>{receipt.start_date ? dayjs(receipt.start_date).format('DD MMM YYYY') : '-'} to {receipt.end_date ? dayjs(receipt.end_date).format('DD MMM YYYY') : '-'}</p>
                            <p>{receipt.trip_duration_days ? `${receipt.trip_duration_days} day(s)` : '-'}</p>
                          </td>
                          <td>{currencyFormatter.format(receipt.receipt_total)} {receipt.currency}</td>
                          <td>{statusLabel(receipt.status)}</td>
                          <td>
                            <span className={riskChipClass(receipt.risk_level)}>{receipt.risk_level || 'Unscored'}</span>
                            <p>{(receipt.risk_score || 0).toFixed(1)} pts</p>
                            <p>{receipt.primary_red_flag ? formatDetectionType(receipt.primary_red_flag) : 'No red flag'}</p>
                          </td>
                          <td>{dayjs(receipt.created_at).format('DD MMM YYYY HH:mm')}</td>
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
