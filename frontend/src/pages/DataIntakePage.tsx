import dayjs from 'dayjs'
import { FormEvent, useEffect, useState } from 'react'
import {
  clearTravelExpenseDatabase,
  downloadSampleSpreadsheet,
  fetchActiveImport,
  fetchActiveImportPreview,
  importReceiptsFromExcel
} from '../api/client'
import { AnalyzeIcon, DocumentIcon, UploadIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { ActiveImport, SpreadsheetPreview } from '../types'

export function DataIntakePage() {
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [autoAnalyze, setAutoAnalyze] = useState(true)

  const [activeImport, setActiveImport] = useState<ActiveImport>()
  const [preview, setPreview] = useState<SpreadsheetPreview>()

  const [loading, setLoading] = useState(false)
  const [clearingData, setClearingData] = useState(false)
  const [downloadingSample, setDownloadingSample] = useState(false)
  const [importProgress, setImportProgress] = useState<{ active: boolean; percent: number; label: string }>({
    active: false,
    percent: 0,
    label: ''
  })
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

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

  async function handleClearDatabase() {
    const confirmed = window.confirm('Clear all travel expense entries, detections, decisions, documents, and imported spreadsheet metadata? This cannot be undone.')
    if (!confirmed) return

    setClearingData(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const result = await clearTravelExpenseDatabase()
      setExcelFile(null)
      setActiveImport(undefined)
      setPreview(undefined)
      setMessage(`Cleared ${result.deleted_claims} travel expense entries. The table is ready for a fresh upload.`)
    } catch (err) {
      setError(String(err))
    } finally {
      setClearingData(false)
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
                <CollapsiblePanel className="panel" title="Data Intake Window" collapsible={false}>
                  <div className="panel-head">
                    <div>
                      <h2 className="section-title"><UploadIcon size={18} />Data Intake Window</h2>
                    </div>
                    <button onClick={handleDownloadSample} disabled={downloadingSample}>
                      <span className="btn-inline"><DocumentIcon size={14} />{downloadingSample ? 'Preparing...' : 'Download 1000-Row Example'}</span>
                    </button>
                    <button type="button" className="small-btn danger-btn" onClick={handleClearDatabase} disabled={clearingData || loading}>
                      {clearingData ? 'Clearing...' : 'Clear Table'}
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
                        <div className="metric-line"><span>Rows Stored</span><AnalyzeIcon className="metric-icon" /></div>
                        <strong>{activeImport.row_count}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Stored Rows Analyzed</span><AnalyzeIcon className="metric-icon" /></div>
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
              <CollapsiblePanel className="panel intake-upload-shell" title="Spreadsheet Upload" allowFocusView>
                <article className="intake-upload-panel">
                  <div className="section-title-row">
                    <div>
                      <h3 className="section-title"><UploadIcon size={16} />Bulk Upload (Excel/CSV)</h3>
                      <p className="muted-text">Use SABIC travel-register spreadsheets. New uploads append to the existing travel expense table.</p>
                    </div>
                    <div className="intake-action-row">
                      <button type="button" className="small-btn ghost-btn" onClick={handleDownloadSample} disabled={downloadingSample}>
                        {downloadingSample ? 'Preparing...' : 'Download Example'}
                      </button>
                      <button type="button" className="small-btn danger-btn" onClick={handleClearDatabase} disabled={clearingData || loading}>
                        {clearingData ? 'Clearing...' : 'Clear Table'}
                      </button>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={handleExcelImport}>
                    <input
                      id="bulk-spreadsheet-upload"
                      className="file-input-hidden"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(event) => setExcelFile(event.target.files?.[0] || null)}
                    />
                    <label className={`upload-dropzone ${excelFile ? 'has-file' : ''}`} htmlFor="bulk-spreadsheet-upload">
                      <span className="upload-dropzone-icon"><UploadIcon size={22} /></span>
                      <span className="upload-dropzone-copy">
                        <strong>{excelFile ? excelFile.name : 'Select spreadsheet file'}</strong>
                        <small>{excelFile ? 'Ready to import and analyze' : 'Excel or CSV · .xlsx, .xls, .csv'}</small>
                      </span>
                      <span className="upload-dropzone-action">{excelFile ? 'Change file' : 'Browse file'}</span>
                    </label>
                    <label className="checkbox-inline">
                      <input type="checkbox" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} />
                      Analyze rows immediately after import
                    </label>
                    <button type="submit" disabled={!excelFile || loading || clearingData}><span className="btn-inline"><UploadIcon size={14} />Append Spreadsheet</span></button>
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
                    {message && <div className="success-box">{message}</div>}
                    {error && <div className="error-box">{error}</div>}
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
                    <p>Preview shows the latest uploaded spreadsheet. Stored row counts include appended imports.</p>
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
                        <div className="metric-line"><span>Rows Stored</span><AnalyzeIcon className="metric-icon" /></div>
                        <strong>{activeImport.row_count}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Stored Rows Analyzed</span><AnalyzeIcon className="metric-icon" /></div>
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
