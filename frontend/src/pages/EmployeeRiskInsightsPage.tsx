import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { fetchEmployeeRiskDashboard } from '../api/client'
import { AnalyzeIcon, ReceiptsIcon, EmployeeIcon, RiskIcon, UsersIcon, WrongClaimIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { EmployeeRiskDashboard, EmployeeRiskProfile } from '../types'
import { formatDetectionType } from '../utils/formatters'

const currencyFormatter = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const integerFormatter = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 0
})

const percentageFormatter = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
})

function riskChipClass(level: string) {
  const normalized = level.toLowerCase()
  if (normalized === 'critical') return 'chip critical'
  if (normalized === 'high') return 'chip high'
  if (normalized === 'medium') return 'chip medium'
  return 'chip low'
}

function toneForRisk(level: string): 'critical' | 'high' | 'medium' | 'low' {
  const normalized = level.toLowerCase()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  return 'low'
}

function riskMeterGradient(value: number): string {
  if (value >= 75) return 'var(--critical), var(--high)'
  if (value >= 50) return 'var(--high), var(--accent)'
  if (value >= 25) return 'var(--medium), var(--accent)'
  return 'var(--low), var(--brand-2)'
}

function employeeRowRiskClass(level: string): string {
  const tone = toneForRisk(level)
  return `employee-risk-row-${tone}`
}

function ChartBarRow({
  label,
  value,
  max,
  tone,
  detail,
  rank
}: {
  label: string
  value: number
  max: number
  tone: 'critical' | 'high' | 'medium' | 'low' | 'brand'
  detail: string
  rank?: number
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className={`leader-row leader-${tone}`}>
      <div className="leader-head">
        <div className="leader-title">
          {typeof rank === 'number' && <span className="leader-rank">#{rank}</span>}
          <span>{label}</span>
        </div>
        <strong>{detail}</strong>
      </div>
      <div className="leader-track">
        <div className={`leader-fill leader-fill-${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function RiskMeter({ value, label, detail }: { value: number; label: string; detail: string }) {
  const bounded = Math.max(0, Math.min(100, value))
  return (
    <div className="risk-meter-card">
      <div
        className="risk-meter-ring"
        style={{
          background: `conic-gradient(${riskMeterGradient(bounded)} ${bounded * 3.6}deg, rgba(255, 255, 255, 0.22) 0deg)`
        }}
      >
        <div className="risk-meter-core">
          <strong>{percentageFormatter.format(bounded)}%</strong>
          <span>{label}</span>
        </div>
      </div>
      <p>{detail}</p>
    </div>
  )
}

function SpotlightCard({
  title,
  subtitle,
  profile,
  metricLabel,
  metricValue,
  tone,
  detail
}: {
  title: string
  subtitle: string
  profile?: EmployeeRiskProfile
  metricLabel: string
  metricValue: string
  tone: 'critical' | 'high' | 'medium' | 'low' | 'brand'
  detail: string
}) {
  if (!profile) {
    return (
      <article className="spotlight-card tone-low">
        <p className="spotlight-eyebrow">{subtitle}</p>
        <h3>{title}</h3>
        <p className="spotlight-empty">No employee data available for this card.</p>
      </article>
    )
  }

  return (
    <article className={`spotlight-card tone-${tone}`}>
      <p className="spotlight-eyebrow">{subtitle}</p>
      <h3>{title}</h3>
      <div className="spotlight-person-row">
        <div>
          <strong className="spotlight-person-name">{profile.employee_name}</strong>
          <p className="spotlight-person-meta">{profile.employee_id} · {profile.department}</p>
        </div>
        <span className={riskChipClass(profile.employee_risk_level)}>{profile.employee_risk_level}</span>
      </div>
      <div className="spotlight-metric-row">
        <span>{metricLabel}</span>
        <strong>{metricValue}</strong>
      </div>
      <p className="spotlight-detail">{detail}</p>
    </article>
  )
}

function byViolation(a: EmployeeRiskProfile, b: EmployeeRiskProfile) {
  if (b.flagged_receipts !== a.flagged_receipts) return b.flagged_receipts - a.flagged_receipts
  if (b.violation_rate_pct !== a.violation_rate_pct) return b.violation_rate_pct - a.violation_rate_pct
  return b.risk_index - a.risk_index
}

function bySpend(a: EmployeeRiskProfile, b: EmployeeRiskProfile) {
  if (b.total_spend !== a.total_spend) return b.total_spend - a.total_spend
  return b.total_receipts - a.total_receipts
}

function byRisk(a: EmployeeRiskProfile, b: EmployeeRiskProfile) {
  if (b.risk_index !== a.risk_index) return b.risk_index - a.risk_index
  return b.flagged_receipts - a.flagged_receipts
}

export function EmployeeRiskInsightsPage() {
  const [dashboard, setDashboard] = useState<EmployeeRiskDashboard>()
  const [error, setError] = useState<string>()

  const [searchTerm, setSearchTerm] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')

  useEffect(() => {
    fetchEmployeeRiskDashboard().then(setDashboard).catch((err) => setError(String(err)))
  }, [])

  const employees = dashboard?.employees ?? []

  const departments = useMemo(() => {
    return Array.from(new Set(employees.map((item) => item.department))).sort((a, b) => a.localeCompare(b))
  }, [employees])

  const filteredEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return employees.filter((employee) => {
      if (departmentFilter && employee.department !== departmentFilter) return false
      if (riskFilter && employee.employee_risk_level.toLowerCase() !== riskFilter.toLowerCase()) return false
      if (!q) return true

      const rawTopDetection = (employee.top_detection_type || '').toLowerCase()
      const formattedTopDetection = employee.top_detection_type
        ? formatDetectionType(employee.top_detection_type).toLowerCase()
        : ''

      return (
        employee.employee_id.toLowerCase().includes(q) ||
        employee.employee_name.toLowerCase().includes(q) ||
        employee.department.toLowerCase().includes(q) ||
        rawTopDetection.includes(q) ||
        formattedTopDetection.includes(q)
      )
    })
  }, [employees, searchTerm, departmentFilter, riskFilter])

  const topViolationEmployees = useMemo(() => [...filteredEmployees].sort(byViolation).slice(0, 8), [filteredEmployees])
  const topSpendEmployees = useMemo(() => [...filteredEmployees].sort(bySpend).slice(0, 8), [filteredEmployees])
  const topRiskEmployees = useMemo(() => [...filteredEmployees].sort(byRisk).slice(0, 8), [filteredEmployees])

  const maxViolationCount = Math.max(1, ...topViolationEmployees.map((item) => item.flagged_receipts))
  const maxSpend = Math.max(1, ...topSpendEmployees.map((item) => item.total_spend))
  const maxRiskIndex = Math.max(1, ...topRiskEmployees.map((item) => item.risk_index))

  const riskBandRows = Object.entries(dashboard?.risk_band_distribution ?? {}).sort((a, b) => b[1] - a[1])
  const maxRiskBandCount = Math.max(1, ...riskBandRows.map((item) => item[1]))
  const totalRiskBandEmployees = riskBandRows.reduce((sum, row) => sum + row[1], 0)

  if (error) return <div className="error-box">{error}</div>
  if (!dashboard) return <div className="panel">Loading employee risk insights...</div>

  const portfolioViolationRate = dashboard.total_receipts > 0
    ? (dashboard.flagged_receipts / dashboard.total_receipts) * 100
    : 0
  const highRiskEmployeeRate = dashboard.total_employees > 0
    ? (dashboard.high_risk_employees / dashboard.total_employees) * 100
    : 0

  const spotlightRisk = topRiskEmployees[0]
  const spotlightViolation = topViolationEmployees[0]
  const spotlightSpend = topSpendEmployees[0]

  return (
    <div className="app-page employee-risk-page">
      <PageTabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            eyebrow: 'HR Risk',
            children: (
              <>
                <CollapsiblePanel className="panel hero-panel employee-risk-hero">
                  <div>
                    <p className="eyebrow">HR Manager Analytics</p>
                    <h2>Employee Risk Intelligence</h2>
                    <p>
                      A command-center view of employee-level violations, spend outliers, and risk concentration trends
                      to prioritize investigations faster.
                    </p>
                  </div>

                  <div className="employee-risk-hero-side">
                    <RiskMeter
                      value={portfolioViolationRate}
                      label="Portfolio Violation Rate"
                      detail={`${dashboard.flagged_receipts} flagged entries across ${dashboard.total_receipts} entries`}
                    />
                    <RiskMeter
                      value={highRiskEmployeeRate}
                      label="High-Risk Employee Ratio"
                      detail={`${dashboard.high_risk_employees} high-risk employees across ${dashboard.total_employees}`}
                    />
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel className="panel employee-risk-spotlight" title="Employee Risk Spotlight">
                  <SpotlightCard
                    title="Highest Risk Employee"
                    subtitle="Composite exposure"
                    profile={spotlightRisk}
                    metricLabel="Risk Index"
                    metricValue={spotlightRisk ? `${spotlightRisk.risk_index}` : '-'}
                    tone={spotlightRisk ? toneForRisk(spotlightRisk.employee_risk_level) : 'low'}
                    detail={spotlightRisk ? `Avg risk score ${spotlightRisk.avg_risk_score} · Max ${spotlightRisk.max_risk_score}` : '-'}
                  />

                  <SpotlightCard
                    title="Most Violations"
                    subtitle="Policy breaches"
                    profile={spotlightViolation}
                    metricLabel="Flagged Entries"
                    metricValue={spotlightViolation ? `${spotlightViolation.flagged_receipts}` : '-'}
                    tone={spotlightViolation ? toneForRisk(spotlightViolation.employee_risk_level) : 'low'}
                    detail={spotlightViolation ? `Violation rate ${spotlightViolation.violation_rate_pct}% · Top detection ${formatDetectionType(spotlightViolation.top_detection_type)}` : '-'}
                  />

                  <SpotlightCard
                    title="Largest Spend Exposure"
                    subtitle="Financial concentration"
                    profile={spotlightSpend}
                    metricLabel="Total Spend (SAR)"
                    metricValue={spotlightSpend ? currencyFormatter.format(spotlightSpend.total_spend) : '-'}
                    tone={spotlightSpend ? toneForRisk(spotlightSpend.employee_risk_level) : 'low'}
                    detail={spotlightSpend ? `Average entry ${currencyFormatter.format(spotlightSpend.avg_receipt_amount)} · ${spotlightSpend.total_receipts} entries` : '-'}
                  />
                </CollapsiblePanel>

                <CollapsiblePanel className="panel" title="Risk Portfolio KPIs">
                  <div className="metric-grid employee-risk-kpis">
          <article className="metric-card">
            <div className="metric-line"><span>Employees Monitored</span><UsersIcon className="metric-icon" /></div>
            <strong>{integerFormatter.format(dashboard.total_employees)}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Total Entries</span><ReceiptsIcon className="metric-icon" /></div>
            <strong>{integerFormatter.format(dashboard.total_receipts)}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Flagged Entries</span><WrongClaimIcon className="metric-icon" /></div>
            <strong>{integerFormatter.format(dashboard.flagged_receipts)}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Suspicious Entries</span><RiskIcon className="metric-icon" /></div>
            <strong>{integerFormatter.format(dashboard.suspicious_receipts)}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Total Spend (SAR)</span><ReceiptsIcon className="metric-icon" /></div>
            <strong>{currencyFormatter.format(dashboard.total_spend)}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Average Entry (SAR)</span><AnalyzeIcon className="metric-icon" /></div>
            <strong>{currencyFormatter.format(dashboard.avg_receipt_amount)}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Average Entries / Employee</span><EmployeeIcon className="metric-icon" /></div>
            <strong>{dashboard.avg_receipts_per_employee}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Average Trip Duration</span><AnalyzeIcon className="metric-icon" /></div>
            <strong>{dashboard.avg_trip_duration_days} days</strong>
          </article>
        </div>
      </CollapsiblePanel>
              </>
            )
          },
          {
            id: 'analytics',
            label: 'Risk Analytics',
            eyebrow: 'Leaders',
            children: (
              <>
      <CollapsiblePanel className="panel" title="Filter Controls">
        <div className="insights-filter-grid">
          <label>
            Search Employee / Detection
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Employee ID, name, department, detection"
            />
          </label>

          <label>
            Department
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="">All Departments</option>
              {departments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
          </label>

          <label>
            Employee Risk Level
            <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
              <option value="">All Levels</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel two-col app-grow" allowFocusView>
        <article className="panel-scroll">
          <h3>Employees With Most Violations</h3>
          {topViolationEmployees.length === 0 && <p className="empty-muted">No employees match current filters.</p>}
          {topViolationEmployees.map((employee, index) => (
            <ChartBarRow
              key={`viol-${employee.employee_id}`}
              label={`${employee.employee_name} (${employee.employee_id})`}
              value={employee.flagged_receipts}
              max={maxViolationCount}
              tone="critical"
              detail={`${employee.flagged_receipts} flagged (${employee.violation_rate_pct}%)`}
              rank={index + 1}
            />
          ))}
        </article>

        <article className="panel-scroll">
          <h3>Top Employee Spend (SAR)</h3>
          {topSpendEmployees.length === 0 && <p className="empty-muted">No employees match current filters.</p>}
          {topSpendEmployees.map((employee, index) => (
            <ChartBarRow
              key={`spend-${employee.employee_id}`}
              label={`${employee.employee_name} (${employee.employee_id})`}
              value={employee.total_spend}
              max={maxSpend}
              tone="brand"
              detail={currencyFormatter.format(employee.total_spend)}
              rank={index + 1}
            />
          ))}
        </article>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel two-col app-grow" allowFocusView>
        <article className="panel-scroll">
          <h3>Highest Employee Risk Index</h3>
          {topRiskEmployees.length === 0 && <p className="empty-muted">No employees match current filters.</p>}
          {topRiskEmployees.map((employee, index) => (
            <ChartBarRow
              key={`risk-${employee.employee_id}`}
              label={`${employee.employee_name} (${employee.employee_id})`}
              value={employee.risk_index}
              max={maxRiskIndex}
              tone={toneForRisk(employee.employee_risk_level)}
              detail={`${employee.risk_index} (${employee.employee_risk_level})`}
              rank={index + 1}
            />
          ))}
        </article>

        <article className="panel-scroll">
          <h3>Risk Band Distribution (By Employee)</h3>
          {riskBandRows.length === 0 && <p className="empty-muted">No employee risk data available.</p>}
          {riskBandRows.map(([riskBand, count]) => (
            <ChartBarRow
              key={riskBand}
              label={riskBand}
              value={count}
              max={maxRiskBandCount}
              tone={toneForRisk(riskBand)}
              detail={`${count} employee(s) · ${totalRiskBandEmployees ? percentageFormatter.format((count / totalRiskBandEmployees) * 100) : '0.0'}%`}
            />
          ))}
        </article>
      </CollapsiblePanel>
              </>
            )
          },
          {
            id: 'scorecard',
            label: 'Employee Scorecard',
            eyebrow: 'Register',
            children: (
      <CollapsiblePanel className="panel table-panel app-grow" allowFocusView>
        <div className="panel-head">
          <div>
            <h3>Employee Risk Scorecard</h3>
            <p>{filteredEmployees.length} employee profiles in view.</p>
          </div>
        </div>

        <div className="table-wrap table-fill-wrap employee-risk-table-wrap">
          <table className="table professional-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Risk Level</th>
                <th>Risk Index</th>
                <th>Entries</th>
                <th>Flagged</th>
                <th>Suspicious</th>
                <th>Incorrect</th>
                <th>Total Spend (SAR)</th>
                <th>Avg Entry</th>
                <th>Avg Trip Days</th>
                <th>Avg Risk Score</th>
                <th>Detections</th>
                <th>Top Detection</th>
                <th>Top Destination</th>
                <th>Last Entry</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={16} className="empty-table">No employee profiles match your filters.</td>
                </tr>
              )}

              {filteredEmployees.map((employee) => (
                <tr key={employee.employee_id} className={employeeRowRiskClass(employee.employee_risk_level)}>
                  <td>
                    <strong>{employee.employee_name}</strong>
                    <p>{employee.employee_id}</p>
                  </td>
                  <td>{employee.department}</td>
                  <td><span className={riskChipClass(employee.employee_risk_level)}>{employee.employee_risk_level}</span></td>
                  <td>{employee.risk_index}</td>
                  <td>{employee.total_receipts}</td>
                  <td>{employee.flagged_receipts} ({employee.violation_rate_pct}%)</td>
                  <td>{employee.suspicious_receipts} ({employee.suspicious_rate_pct}%)</td>
                  <td>{employee.incorrect_receipts} ({employee.incorrect_rate_pct}%)</td>
                  <td>{currencyFormatter.format(employee.total_spend)}</td>
                  <td>{currencyFormatter.format(employee.avg_receipt_amount)}</td>
                  <td>{employee.avg_trip_duration_days}</td>
                  <td>{employee.avg_risk_score}</td>
                  <td>{employee.total_detections}</td>
                  <td>{employee.top_detection_type ? `${formatDetectionType(employee.top_detection_type)} (${employee.top_detection_count})` : '-'}</td>
                  <td>{employee.top_destination_city || '-'}</td>
                  <td>{employee.last_receipt_at ? dayjs(employee.last_receipt_at).format('DD MMM YYYY') : '-'}</td>
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
