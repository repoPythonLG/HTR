import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { fetchEmployeeDashboard } from '../api/client'
import { AnalyzeIcon, ReceiptsIcon, EmployeeIcon, RiskIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { EmployeeDashboard } from '../types'

export function EmployeeViewPage() {
  const [data, setData] = useState<EmployeeDashboard>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    fetchEmployeeDashboard().then(setData).catch((err) => setError(String(err)))
  }, [])

  if (error) return <div className="error-box">{error}</div>
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
              <CollapsiblePanel className="panel">
                <h2 className="section-title"><EmployeeIcon size={18} />Employee Entry Visibility</h2>
                <div className="metric-grid">
                  <article className="metric-card">
                    <div className="metric-line"><span>Employee Code</span><EmployeeIcon className="metric-icon" /></div>
                    <strong>{data.employee_id}</strong>
                  </article>
                  <article className="metric-card">
                    <div className="metric-line"><span>Total Entries</span><ReceiptsIcon className="metric-icon" /></div>
                    <strong>{data.total_receipts}</strong>
                  </article>
                  <article className="metric-card">
                    <div className="metric-line"><span>Pending</span><RiskIcon className="metric-icon" /></div>
                    <strong>{data.pending_receipts}</strong>
                  </article>
                  <article className="metric-card">
                    <div className="metric-line"><span>Analyzed</span><AnalyzeIcon className="metric-icon" /></div>
                    <strong>{data.analyzed_receipts}</strong>
                  </article>
                  <article className="metric-card">
                    <div className="metric-line"><span>Suspicious</span><RiskIcon className="metric-icon" /></div>
                    <strong>{data.suspicious_receipts}</strong>
                  </article>
                </div>
              </CollapsiblePanel>
            )
          },
          {
            id: 'recent',
            label: 'Recent Entries',
            eyebrow: 'Entries',
            children: (
              <CollapsiblePanel className="panel table-panel app-grow" allowFocusView>
                <h3 className="section-title"><ReceiptsIcon size={16} />Recent Entries</h3>
                <div className="table-wrap table-fill-wrap">
                  <table className="table professional-table">
                    <thead>
                      <tr>
                        <th>Entry</th>
                        <th>Destination</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_receipts.map((receipt) => (
                        <tr key={receipt.receipt_id} className={receipt.suspicious_flag ? 'row-suspicious' : ''}>
                          <td>{receipt.receipt_id}</td>
                          <td>{receipt.destination_city || '-'}</td>
                          <td>{receipt.receipt_total.toFixed(2)} {receipt.currency}</td>
                          <td>{receipt.status}</td>
                          <td>{dayjs(receipt.created_at).format('DD MMM YYYY')}</td>
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
