import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { fetchEmployeeDashboard } from '../api/client'
import { AnalyzeIcon, ClaimsIcon, EmployeeIcon, RiskIcon } from '../components/BrandIcons'
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
                <h2 className="section-title"><EmployeeIcon size={18} />Employee Claim Visibility</h2>
                <div className="metric-grid">
                  <article className="metric-card">
                    <div className="metric-line"><span>Employee Code</span><EmployeeIcon className="metric-icon" /></div>
                    <strong>{data.employee_id}</strong>
                  </article>
                  <article className="metric-card">
                    <div className="metric-line"><span>Total Claims</span><ClaimsIcon className="metric-icon" /></div>
                    <strong>{data.total_claims}</strong>
                  </article>
                  <article className="metric-card">
                    <div className="metric-line"><span>Pending</span><RiskIcon className="metric-icon" /></div>
                    <strong>{data.pending_claims}</strong>
                  </article>
                  <article className="metric-card">
                    <div className="metric-line"><span>Analyzed</span><AnalyzeIcon className="metric-icon" /></div>
                    <strong>{data.analyzed_claims}</strong>
                  </article>
                  <article className="metric-card">
                    <div className="metric-line"><span>Suspicious</span><RiskIcon className="metric-icon" /></div>
                    <strong>{data.suspicious_claims}</strong>
                  </article>
                </div>
              </CollapsiblePanel>
            )
          },
          {
            id: 'recent',
            label: 'Recent Claims',
            eyebrow: 'Claims',
            children: (
              <CollapsiblePanel className="panel table-panel app-grow" allowFocusView>
                <h3 className="section-title"><ClaimsIcon size={16} />Recent Claims</h3>
                <div className="table-wrap table-fill-wrap">
                  <table className="table professional-table">
                    <thead>
                      <tr>
                        <th>Claim</th>
                        <th>Destination</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_claims.map((claim) => (
                        <tr key={claim.claim_id} className={claim.suspicious_flag ? 'row-suspicious' : ''}>
                          <td>{claim.claim_id}</td>
                          <td>{claim.destination_city || '-'}</td>
                          <td>{claim.claim_total.toFixed(2)} {claim.currency}</td>
                          <td>{claim.status}</td>
                          <td>{dayjs(claim.created_at).format('DD MMM YYYY')}</td>
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
