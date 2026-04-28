import dayjs from 'dayjs'
import { FormEvent, useEffect, useState } from 'react'
import {
  downloadSampleSpreadsheet,
  fetchActiveImport,
  fetchActiveImportPreview,
  importReceiptsFromExcel,
  uploadClaimPack
} from '../api/client'
import { AnalyzeIcon, DocumentIcon, UploadIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { useAuth } from '../context/AuthContext'
import { ActiveImport, SpreadsheetPreview } from '../types'

export function DataIntakePage() {
  const { user } = useAuth()

  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [autoAnalyze, setAutoAnalyze] = useState(true)

  const [activeImport, setActiveImport] = useState<ActiveImport>()
  const [preview, setPreview] = useState<SpreadsheetPreview>()

  const [loading, setLoading] = useState(false)
  const [downloadingSample, setDownloadingSample] = useState(false)
  const [importProgress, setImportProgress] = useState<{ active: boolean; percent: number; label: string }>({
    active: false,
    percent: 0,
    label: ''
  })
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  const [form, setForm] = useState({
    employee_id: user?.employee_code ?? '',
    employee_name: '',
    department: 'HR',
    start_date: '',
    end_date: '',
    destination_city: 'Riyadh',
    receipt_total: '',
    currency: 'SAR'
  })
  const [files, setFiles] = useState<File[]>([])

  const canImportExcel = user?.role === 'reviewer' || user?.role === 'administrator'

  useEffect(() => {
    if (user?.employee_code && user.role === 'employee') {
      setForm((prev) => ({ ...prev, employee_id: user.employee_code || '' }))
    }
  }, [user?.employee_code, user?.role])

  async function loadActiveImport() {
    try {
      const current = await fetchActiveImport()
      setActiveImport(current)
      const table = await fetchActiveImportPreview()
      setPreview(table)
    } catch {
      setActiveImport(undefined)
      setPreview(undefined)
    }
  }

  useEffect(() => {
    loadActiveImport()
  }, [])

  async function handleExcelImport(event: FormEvent) {
    event.preventDefault()
    if (!excelFile) return

    setError(undefined)
    setMessage(undefined)
    setLoading(true)
    setImportProgress({ active: true, percent: 5, label: 'Preparing spreadsheet upload...' })
    try {
      const result = await importReceiptsFromExcel(excelFile, autoAnalyze, (percent) => {
        const uploadPercent = Math.max(8, Math.min(85, Math.round(percent * 0.85)))
        setImportProgress({
          active: true,
          percent: uploadPercent,
          label: percent >= 100
            ? 'Upload complete. Importing rows and running entry analysis...'
            : `Uploading spreadsheet... ${percent}%`
        })
      })
      setImportProgress({ active: true, percent: 100, label: 'Import complete. Refreshing entry workspace...' })
      setMessage(
        `Imported ${result.imported_receipts} travel expense entries. Analyzed ${result.analyzed_receipts}. Skipped ${result.skipped_rows}.`
      )
      setExcelFile(null)
      await loadActiveImport()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
      window.setTimeout(() => setImportProgress({ active: false, percent: 0, label: '' }), 650)
    }
  }

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.employee_id || !form.employee_name || !form.receipt_total || files.length === 0) {
      setError('Employee, total amount, and at least one document are required.')
      return
    }

    setError(undefined)
    setMessage(undefined)
    setLoading(true)
    try {
      const result = await uploadClaimPack({
        ...form,
        files
      })
      setMessage(`Manual travel expense entry ${result.receipt_id} uploaded successfully.`)
      setFiles([])
      setForm((prev) => ({
        ...prev,
        employee_name: '',
        start_date: '',
        end_date: '',
        receipt_total: ''
      }))
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadSample() {
    setDownloadingSample(true)
    setError(undefined)
    try {
      const blob = await downloadSampleSpreadsheet()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'sabic_travel_expense_entries_example_1000.xlsx'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(String(err))
    } finally {
      setDownloadingSample(false)
    }
  }

  function openSpreadsheetNewTab() {
    window.open('/intake/spreadsheet', '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="app-page intake-page">
      <PageTabs
        defaultTabId="upload"
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            eyebrow: 'Intake',
            children: (
              <>
                <CollapsiblePanel className="panel">
                  <div className="panel-head">
                    <div>
                      <h2 className="section-title"><UploadIcon size={18} />Data Intake Window</h2>
                      <p>Bulk import and manual travel expense entry submission have been moved here from the workbench.</p>
                    </div>
                    <button onClick={handleDownloadSample} disabled={downloadingSample}>
                      <span className="btn-inline"><DocumentIcon size={14} />{downloadingSample ? 'Preparing...' : 'Download 1000-Row Example'}</span>
                    </button>
                  </div>

                  {loading && <div className="loading-bar" />}
                  {message && <div className="success-box">{message}</div>}
                  {error && <div className="error-box">{error}</div>}
                </CollapsiblePanel>

                <CollapsiblePanel className="panel" title="Current Imported Dataset">
                  {!activeImport && <p className="empty-muted">No spreadsheet imported yet.</p>}
                  {activeImport && (
                    <div className="metric-grid compact intake-import-metrics">
                      <article className="metric-card metric-card-wide">
                        <div className="metric-line"><span>File Name</span><DocumentIcon className="metric-icon" /></div>
                        <strong className="metric-value-ellipsis" title={activeImport.file_name}>{activeImport.file_name}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Uploaded</span><UploadIcon className="metric-icon" /></div>
                        <strong>{dayjs(activeImport.uploaded_at).format('DD MMM YYYY HH:mm')}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Rows Imported</span><AnalyzeIcon className="metric-icon" /></div>
                        <strong>{activeImport.row_count}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Rows Analyzed</span><AnalyzeIcon className="metric-icon" /></div>
                        <strong>{activeImport.analyzed_count}</strong>
                      </article>
                    </div>
                  )}
                </CollapsiblePanel>
              </>
            )
          },
          {
            id: 'upload',
            label: 'Upload Entries',
            eyebrow: 'Input',
            children: (
              <CollapsiblePanel className="panel two-col app-grow panel-scroll">
                {canImportExcel && (
                  <article>
                    <h3 className="section-title"><UploadIcon size={16} />Bulk Upload (Excel/CSV)</h3>
                    <p>Use SABIC travel-register spreadsheets. New upload replaces the prior imported dataset.</p>
                    <form className="form-grid" onSubmit={handleExcelImport}>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(event) => setExcelFile(event.target.files?.[0] || null)}
                      />
                      <label className="checkbox-inline">
                        <input type="checkbox" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} />
                        Analyze rows immediately after import
                      </label>
                      <button type="submit" disabled={!excelFile}><span className="btn-inline"><UploadIcon size={14} />Import Spreadsheet</span></button>
                      {importProgress.active && (
                        <div className="import-progress-card" aria-live="polite">
                          <div className="import-progress-head">
                            <span>{importProgress.label}</span>
                            <strong>{importProgress.percent}%</strong>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${importProgress.percent}%` }} />
                          </div>
                        </div>
                      )}
                    </form>
                  </article>
                )}

                <article>
                  <h3 className="section-title"><UploadIcon size={16} />Manual Travel Expense Entry Upload</h3>
                  <form className="form-grid" onSubmit={handleManualSubmit}>
                    <label>
                      Employee ID
                      <input
                        value={form.employee_id}
                        disabled={user?.role === 'employee'}
                        onChange={(e) => setForm((prev) => ({ ...prev, employee_id: e.target.value }))}
                      />
                    </label>

                    <label>
                      Employee Name
                      <input value={form.employee_name} onChange={(e) => setForm((prev) => ({ ...prev, employee_name: e.target.value }))} />
                    </label>

                    <label>
                      Department
                      <input value={form.department} onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))} />
                    </label>

                    <label>
                      Destination City
                      <input value={form.destination_city} onChange={(e) => setForm((prev) => ({ ...prev, destination_city: e.target.value }))} />
                    </label>

                    <div className="split-row">
                      <label>
                        Start Date
                        <input type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} />
                      </label>
                      <label>
                        End Date
                        <input type="date" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} />
                      </label>
                    </div>

                    <div className="split-row">
                      <label>
                        Travel Expense Amount
                        <input type="number" value={form.receipt_total} onChange={(e) => setForm((prev) => ({ ...prev, receipt_total: e.target.value }))} />
                      </label>
                      <label>
                        Currency
                        <input value={form.currency} onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))} />
                      </label>
                    </div>

                    <label>
                      Attach Documents
                      <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                    </label>

                    <button type="submit"><span className="btn-inline"><UploadIcon size={14} />Upload Travel Expense Entry</span></button>
                  </form>
                </article>
              </CollapsiblePanel>
            )
          },
          {
            id: 'spreadsheet',
            label: 'Spreadsheet Preview',
            eyebrow: 'Data',
            children: (
              <CollapsiblePanel className="panel table-panel app-grow intake-last-import-panel" allowFocusView>
                <div className="panel-head">
                  <div>
                    <h3 className="section-title"><AnalyzeIcon size={16} />Last Imported Spreadsheet</h3>
                    <p>The application risk dataset is based on this latest uploaded file.</p>
                  </div>
                  <button onClick={openSpreadsheetNewTab} disabled={!activeImport}>
                    <span className="btn-inline"><DocumentIcon size={14} />Open Full Spreadsheet (New Tab)</span>
                  </button>
                </div>

                {!activeImport && <p className="empty-muted">No spreadsheet imported yet.</p>}

                {activeImport && (
                  <>
                    <div className="metric-grid compact intake-import-metrics">
                      <article className="metric-card metric-card-wide">
                        <div className="metric-line"><span>File Name</span><DocumentIcon className="metric-icon" /></div>
                        <strong className="metric-value-ellipsis" title={activeImport.file_name}>{activeImport.file_name}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Uploaded</span><UploadIcon className="metric-icon" /></div>
                        <strong>{dayjs(activeImport.uploaded_at).format('DD MMM YYYY HH:mm')}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Rows Imported</span><AnalyzeIcon className="metric-icon" /></div>
                        <strong>{activeImport.row_count}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Rows Analyzed</span><AnalyzeIcon className="metric-icon" /></div>
                        <strong>{activeImport.analyzed_count}</strong>
                      </article>
                    </div>

                    {preview && preview.columns.length > 0 ? (
                      <div className="table-wrap table-fill-wrap intake-import-table-wrap">
                        <table className="table professional-table">
                          <thead>
                            <tr>
                              {preview.columns.map((column) => <th key={column}>{column}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.rows.slice(0, 20).map((row, index) => (
                              <tr key={index}>
                                {preview.columns.map((_, colIndex) => (
                                  <td key={`${index}-${colIndex}`}>{row[colIndex] || '-'}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="empty-muted">No spreadsheet rows to preview yet.</p>
                    )}
                  </>
                )}
              </CollapsiblePanel>
            )
          }
        ]}
      />
    </div>
  )
}
