import { useEffect, useState } from 'react'
import { fetchEmployeeDashboard, fetchExecutiveDashboard } from '../api/client'
import { AnalyzeIcon, ClaimsIcon, RiskIcon, WrongClaimIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { useAuth } from '../context/AuthContext'
import { EmployeeDashboard, ExecutiveDashboard } from '../types'
import { formatDetectionType } from '../utils/formatters'

function BarRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="bar-row">
      <div className="bar-head">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ExecutiveDashboardPage() {
  const { user } = useAuth()
  const [executive, setExecutive] = useState<ExecutiveDashboard>()
  const [employee, setEmployee] = useState<EmployeeDashboard>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    setError(undefined)
    if (user?.role === 'employee') {
      fetchEmployeeDashboard().then(setEmployee).catch((err) => setError(String(err)))
      return
    }
    fetchExecutiveDashboard().then(setExecutive).catch((err) => setError(String(err)))
  }, [user?.role])

  if (error) {
    return <div className="error-box">{error}</div>
  }

  if (user?.role === 'employee') {
    if (!employee) return <div className="panel">Loading employee dashboard...</div>
    return (
      <div className="app-page executive-page">
        <CollapsiblePanel className="panel hero-panel">
          <div>
            <p className="eyebrow">Employee Performance</p>
            <h2>My Reimbursement Portfolio</h2>
            <p>Track your submission health and flagged claims in real time.</p>
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel className="panel app-grow" title="Employee Claim Metrics">
          <div className="metric-grid">
            <article className="metric-card">
              <div className="metric-line"><span>Total Claims</span><ClaimsIcon className="metric-icon" /></div>
              <strong>{employee.total_claims}</strong>
            </article>
            <article className="metric-card">
              <div className="metric-line"><span>Pending</span><RiskIcon className="metric-icon" /></div>
              <strong>{employee.pending_claims}</strong>
            </article>
            <article className="metric-card">
              <div className="metric-line"><span>Analyzed</span><AnalyzeIcon className="metric-icon" /></div>
              <strong>{employee.analyzed_claims}</strong>
            </article>
            <article className="metric-card">
              <div className="metric-line"><span>Flagged</span><WrongClaimIcon className="metric-icon" /></div>
              <strong>{employee.suspicious_claims}</strong>
            </article>
          </div>
        </CollapsiblePanel>
      </div>
    )
  }

  if (!executive) {
    return <div className="panel">Loading executive dashboard...</div>
  }

  const qualityIndex = Math.max(0, Math.round(100 - executive.wrong_claim_rate_pct))

  const riskRows = Object.entries(executive.by_risk_level).sort((a, b) => b[1] - a[1])
  const deptRows = Object.entries(executive.by_department).sort((a, b) => b[1] - a[1]).slice(0, 8)

  const totalRisk = riskRows.reduce((sum, row) => sum + row[1], 0)
  const totalDept = deptRows.reduce((sum, row) => sum + row[1], 0)

  return (
    <div className="app-page executive-page">
      <CollapsiblePanel className="panel hero-panel">
        <div>
          <p className="eyebrow">Corporate Compliance Center</p>
          <h2>Reimbursement Control Dashboard</h2>
          <p>Monitor suspicious claim concentration, wrong-claim trends, and portfolio exposure.</p>
        </div>
        <div className="quality-gauge">
          <span>Control Quality Index</span>
          <strong>{qualityIndex}</strong>
          <p>/ 100</p>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel" title="Portfolio Performance Metrics">
        <div className="metric-grid">
          <article className="metric-card">
            <div className="metric-line"><span>Total Claims</span><ClaimsIcon className="metric-icon" /></div>
            <strong>{executive.total_claims}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Analyzed Claims</span><AnalyzeIcon className="metric-icon" /></div>
            <strong>{executive.analyzed_claims}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Suspicious Claims</span><RiskIcon className="metric-icon" /></div>
            <strong>{executive.suspicious_claims}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Wrong Claims</span><WrongClaimIcon className="metric-icon" /></div>
            <strong>{executive.wrong_claims}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Suspicious Rate</span><RiskIcon className="metric-icon" /></div>
            <strong>{executive.suspicious_rate_pct}%</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Wrong-Claim Rate</span><WrongClaimIcon className="metric-icon" /></div>
            <strong>{executive.wrong_claim_rate_pct}%</strong>
          </article>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel two-col panel-scroll" allowFocusView>
        <article>
          <h3>Risk Band Distribution</h3>
          {riskRows.length === 0 && <p className="empty-muted">No analyzed claims yet.</p>}
          {riskRows.map(([level, count]) => (
            <BarRow
              key={level}
              label={level}
              value={count}
              total={totalRisk}
              tone={level.toLowerCase()}
            />
          ))}
        </article>

        <article>
          <h3>Department Exposure</h3>
          {deptRows.length === 0 && <p className="empty-muted">No department data available yet.</p>}
          {deptRows.map(([dept, count]) => (
            <BarRow
              key={dept}
              label={dept}
              value={count}
              total={totalDept}
              tone="brand"
            />
          ))}
        </article>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel table-panel app-grow" allowFocusView>
        <div className="panel-head">
          <h3>Top Detection Drivers</h3>
          <p>Most common discrepancies currently driving risk score escalation.</p>
        </div>

        <div className="table-wrap table-fill-wrap">
          <table className="table professional-table">
            <thead>
              <tr>
                <th>Detection Type</th>
                <th>Triggered Cases</th>
              </tr>
            </thead>
            <tbody>
              {executive.top_detection_types.length === 0 && (
                <tr>
                  <td colSpan={2} className="empty-table">No detections yet. Import claims or run analysis.</td>
                </tr>
              )}
              {executive.top_detection_types.map((item) => (
                <tr key={item.detection_type}>
                  <td>{formatDetectionType(item.detection_type)}</td>
                  <td>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsiblePanel>
    </div>
  )
}
