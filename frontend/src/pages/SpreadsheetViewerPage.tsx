import { useEffect, useState } from 'react'
import { fetchActiveImportPreview } from '../api/client'
import { SpreadsheetPreview } from '../types'

export function SpreadsheetViewerPage() {
  const [preview, setPreview] = useState<SpreadsheetPreview>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    fetchActiveImportPreview().then(setPreview).catch((err) => setError(String(err)))
  }, [])

  if (error) {
    return <div className="error-box">{error}</div>
  }

  if (!preview) {
    return <div className="panel">Loading spreadsheet preview...</div>
  }

  return (
    <div className="app-page spreadsheet-page">
      <section className="panel">
        <h2>Spreadsheet Viewer</h2>
        <p>{preview.file_name} · Rows shown: {preview.total_rows}</p>
      </section>

      <section className="panel table-panel app-grow">
        {preview.columns.length === 0 && <p className="empty-muted">No spreadsheet rows to display.</p>}
        {preview.columns.length > 0 && (
          <div className="table-wrap table-fill-wrap">
            <table className="table professional-table">
              <thead>
                <tr>
                  {preview.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr key={index}>
                    {preview.columns.map((_, colIndex) => (
                      <td key={`${index}-${colIndex}`}>{row[colIndex] || '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
