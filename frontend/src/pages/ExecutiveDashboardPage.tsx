import { useEffect, useState } from 'react'
import { fetchEmployeeDashboard, fetchExecutiveDashboard } from '../api/client'
import { AnalyzeIcon, ReceiptsIcon, RiskIcon, WrongClaimIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
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

function DetectionDriversBoard({ drivers }: { drivers: ExecutiveDashboard['top_detection_types'] }) {
  const totalSignals = drivers.reduce((sum, item) => sum + item.count, 0)
  const topDriver = drivers[0]
  const maxDriverCount = Math.max(1, ...drivers.map((item) => item.count))
  const visibleDrivers = drivers.slice(0, 8)

  if (drivers.length === 0 || !topDriver) {
    return (
      <div className="driver-empty-state">
        <AnalyzeIcon size={24} />
        <strong>No detection drivers yet</strong>
        <p>Import entries or run analysis to build the executive detection profile.</p>
      </div>
    )
  }

  return (
    <div className="driver-board">
      <article className="driver-lead-card">
        <div>
          <p className="eyebrow">Primary Driver</p>
          <h3>{formatDetectionType(topDriver.detection_type)}</h3>
          <p>Largest contributor to current risk escalation volume.</p>
        </div>

        <div className="driver-signal-ring" aria-label={`${topDriver.count} triggered cases`}>
          <span>{topDriver.count}</span>
          <small>cases</small>
        </div>

        <dl className="driver-lead-metrics">
          <div>
            <dt>Total Signals</dt>
            <dd>{totalSignals}</dd>
          </div>
          <div>
            <dt>Driver Share</dt>
            <dd>{Math.round((topDriver.count / Math.max(totalSignals, 1)) * 100)}%</dd>
          </div>
        </dl>
      </article>

      <div className="driver-rank-list">
        {visibleDrivers.map((item, index) => {
          const pctOfTotal = Math.round((item.count / Math.max(totalSignals, 1)) * 100)
          const pctOfMax = Math.max(4, Math.round((item.count / maxDriverCount) * 100))

          return (
            <article className={`driver-rank-card driver-tone-${(index % 5) + 1}`} key={item.detection_type}>
              <span className="driver-rank-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="driver-rank-copy">
                <strong>{formatDetectionType(item.detection_type)}</strong>
                <p>{pctOfTotal}% of triggered detection volume</p>
              </div>
              <strong className="driver-rank-count">{item.count}</strong>
              <div className="driver-rank-track" aria-hidden="true">
                <span style={{ width: `${pctOfMax}%` }} />
              </div>
            </article>
          )
        })}
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
        <PageTabs
          tabs={[
            {
              id: 'overview',
              label: 'Overview',
              eyebrow: 'My Entries',
              children: (
                <>
                  <CollapsiblePanel className="panel hero-panel" collapsible={false}>
                    <div>
                      <p className="eyebrow">Employee Performance</p>
                      <h2>My Reimbursement Portfolio</h2>
                      <p>Track your submission health and flagged entries in real time.</p>
                    </div>
                  </CollapsiblePanel>

                  <CollapsiblePanel className="panel" title="Employee Entry Metrics">
                    <div className="metric-grid">
                      <article className="metric-card">
                        <div className="metric-line"><span>Total Entries</span><ReceiptsIcon className="metric-icon" /></div>
                        <strong>{employee.total_receipts}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Pending</span><RiskIcon className="metric-icon" /></div>
                        <strong>{employee.pending_receipts}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Analyzed</span><AnalyzeIcon className="metric-icon" /></div>
                        <strong>{employee.analyzed_receipts}</strong>
                      </article>
                      <article className="metric-card">
                        <div className="metric-line"><span>Flagged</span><WrongClaimIcon className="metric-icon" /></div>
                        <strong>{employee.suspicious_receipts}</strong>
                      </article>
                    </div>
                  </CollapsiblePanel>
                </>
              )
            }
          ]}
        />
      </div>
    )
  }

  if (!executive) {
    return <div className="panel">Loading executive dashboard...</div>
  }

  const riskRows = Object.entries(executive.by_risk_level).sort((a, b) => b[1] - a[1])
  const deptRows = Object.entries(executive.by_department).sort((a, b) => b[1] - a[1]).slice(0, 8)

  const totalRisk = riskRows.reduce((sum, row) => sum + row[1], 0)
  const totalDept = deptRows.reduce((sum, row) => sum + row[1], 0)

  return (
    <div className="app-page executive-page">
      <CollapsiblePanel className="panel executive-metrics-panel" title="Portfolio Performance Metrics">
        <div className="metric-grid">
          <article className="metric-card">
            <div className="metric-line"><span>Total Entries</span><ReceiptsIcon className="metric-icon" /></div>
            <strong>{executive.total_receipts}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Analyzed Entries</span><AnalyzeIcon className="metric-icon" /></div>
            <strong>{executive.analyzed_receipts}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Suspicious Entries</span><RiskIcon className="metric-icon" /></div>
            <strong>{executive.suspicious_receipts}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Wrong Entries</span><WrongClaimIcon className="metric-icon" /></div>
            <strong>{executive.wrong_receipts}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Suspicious Rate</span><RiskIcon className="metric-icon" /></div>
            <strong>{executive.suspicious_rate_pct}%</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Wrong-Entry Rate</span><WrongClaimIcon className="metric-icon" /></div>
            <strong>{executive.wrong_receipt_rate_pct}%</strong>
          </article>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel two-col executive-risk-panel" title="Executive Risk Snapshot">
        <article>
          <h3>Risk Band Distribution</h3>
          {riskRows.length === 0 && <p className="empty-muted">No analyzed entries yet.</p>}
          {riskRows.map(([level, count]) => (
            <BarRow key={`overview-risk-${level}`} label={level} value={count} total={totalRisk} tone={level.toLowerCase()} />
          ))}
        </article>

        <article>
          <h3>Department Exposure</h3>
          {deptRows.length === 0 && <p className="empty-muted">No department data available yet.</p>}
          {deptRows.map(([dept, count]) => (
            <BarRow key={`overview-dept-${dept}`} label={dept} value={count} total={totalDept} tone="brand" />
          ))}
        </article>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel driver-panel executive-driver-panel app-grow" title="Top Detection Drivers" allowFocusView>
        <div className="panel-head">
          <div>
            <h3>Top Detection Drivers</h3>
            <p>Most common discrepancies currently driving risk score escalation.</p>
          </div>
          <span className="source-ref-pill">{executive.top_detection_types.length} active drivers</span>
        </div>

        <div className="driver-panel-scroll panel-scroll">
          <DetectionDriversBoard drivers={executive.top_detection_types} />
        </div>
      </CollapsiblePanel>
    </div>
  )
}
