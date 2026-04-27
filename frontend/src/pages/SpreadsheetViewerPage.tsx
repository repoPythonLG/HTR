import { useEffect, useState } from 'react'
import { fetchActiveImportPreview } from '../api/client'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
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
      <PageTabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            eyebrow: 'Spreadsheet',
            children: (
              <CollapsiblePanel className="panel app-grow">
                <h2>Spreadsheet Viewer</h2>
                <p>{preview.file_name} · Rows shown: {preview.total_rows}</p>
              </CollapsiblePanel>
            )
          },
          {
            id: 'data',
            label: 'Data Table',
            eyebrow: 'Rows',
            children: (
              <CollapsiblePanel className="panel table-panel app-grow" title="Spreadsheet Data Table" allowFocusView>
                {preview.columns.length === 0 && <p className="empty-muted">No spreadsheet rows to display.</p>}
                {preview.columns.length > 0 && (
                  <div className="table-wrap table-fill-wrap">
                    <table className="table professional-table">
                      <thead>
                        <tr>
                          {preview.columns.map((column) => <th key={column}>{column}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row, index) => (
                          <tr key={index}>
                            {preview.columns.map((_, colIndex) => <td key={`${index}-${colIndex}`}>{row[colIndex] || '-'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CollapsiblePanel>
            )
          }
        ]}
      />
    </div>
  )
}
