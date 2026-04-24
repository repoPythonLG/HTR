import { useEffect, useMemo, useState } from 'react'
import { fetchOutlierMapDashboard } from '../api/client'
import { AnalyzeIcon, OutlierIcon, RiskIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { OutlierMapDashboard, OutlierMapPoint } from '../types'

const CLUSTER_COLORS = ['#2f60b7', '#228750', '#ce7b1f', '#6f52b5', '#0d8895']

function formatMetricValue(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
  }
  if (Math.abs(value) >= 100) {
    return value.toLocaleString('en-GB', { maximumFractionDigits: 1 })
  }
  return value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}

function clusterColor(point: OutlierMapPoint): string {
  if (point.outlier_flag) return '#b52735'
  if (point.cluster_id < 0) return '#7b4550'
  return CLUSTER_COLORS[point.cluster_id % CLUSTER_COLORS.length]
}

function buildTicks(minValue: number, maxValue: number, count = 5): number[] {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return [0]
  if (Math.abs(maxValue - minValue) < 1e-9) return [minValue]
  const step = (maxValue - minValue) / (count - 1)
  return Array.from({ length: count }, (_, index) => minValue + step * index)
}

export function OutlierAnalyticsPage() {
  const [dashboard, setDashboard] = useState<OutlierMapDashboard>()
  const [error, setError] = useState<string>()
  const [xMetric, setXMetric] = useState('claim_total')
  const [yMetric, setYMetric] = useState('trip_duration_days')
  const [outliersOnly, setOutliersOnly] = useState(false)
  const [clusterFilter, setClusterFilter] = useState('all')
  const [hoveredClaimId, setHoveredClaimId] = useState<string>()

  useEffect(() => {
    fetchOutlierMapDashboard({ xMetric, yMetric })
      .then((data) => {
        setDashboard(data)
        setError(undefined)
      })
      .catch((err) => setError(String(err)))
  }, [xMetric, yMetric])

  useEffect(() => {
    if (!dashboard) return
    const availableClusters = new Set(['all', ...dashboard.clusters.map((item) => String(item.cluster_id))])
    if (!availableClusters.has(clusterFilter)) {
      setClusterFilter('all')
    }
  }, [dashboard, clusterFilter])

  const filteredPoints = useMemo(() => {
    if (!dashboard) return []
    return dashboard.points.filter((point) => {
      if (outliersOnly && !point.outlier_flag) return false
      if (clusterFilter !== 'all' && point.cluster_id !== Number(clusterFilter)) return false
      return true
    })
  }, [dashboard, outliersOnly, clusterFilter])

  const hoveredPoint = useMemo(() => {
    if (!hoveredClaimId) return undefined
    return filteredPoints.find((point) => point.claim_id === hoveredClaimId)
  }, [filteredPoints, hoveredClaimId])

  const topOutliers = useMemo(() => {
    if (!dashboard) return []
    return [...dashboard.points]
      .filter((point) => point.outlier_flag)
      .sort((a, b) => b.distance_score - a.distance_score)
      .slice(0, 120)
  }, [dashboard])

  if (error) return <div className="error-box">{error}</div>
  if (!dashboard) return <div className="panel">Loading outlier analytics...</div>

  const plotWidth = 1100
  const plotHeight = 560
  const margin = { top: 20, right: 24, bottom: 60, left: 74 }
  const innerWidth = plotWidth - margin.left - margin.right
  const innerHeight = plotHeight - margin.top - margin.bottom

  const xValues = filteredPoints.map((item) => item.x_value)
  const yValues = filteredPoints.map((item) => item.y_value)

  const xMin = xValues.length ? Math.min(...xValues) : 0
  const xMax = xValues.length ? Math.max(...xValues) : 1
  const yMin = yValues.length ? Math.min(...yValues) : 0
  const yMax = yValues.length ? Math.max(...yValues) : 1

  const safeXMin = xMin === xMax ? xMin - 1 : xMin
  const safeXMax = xMin === xMax ? xMax + 1 : xMax
  const safeYMin = yMin === yMax ? yMin - 1 : yMin
  const safeYMax = yMin === yMax ? yMax + 1 : yMax

  const xSpan = safeXMax - safeXMin
  const ySpan = safeYMax - safeYMin
  const xLower = safeXMin - xSpan * 0.05
  const xUpper = safeXMax + xSpan * 0.05
  const yLower = safeYMin - ySpan * 0.05
  const yUpper = safeYMax + ySpan * 0.05

  const xTicks = buildTicks(xLower, xUpper, 6)
  const yTicks = buildTicks(yLower, yUpper, 6)

  const toX = (value: number) => margin.left + ((value - xLower) / (xUpper - xLower || 1)) * innerWidth
  const toY = (value: number) => margin.top + innerHeight - ((value - yLower) / (yUpper - yLower || 1)) * innerHeight

  return (
    <div className="app-page outlier-page">
      <CollapsiblePanel className="panel hero-panel" title="Outlier Analytics Overview">
        <div>
          <p className="eyebrow">Statistical Outlier Monitor</p>
          <h2>Outlier Analytics Studio</h2>
          <p>
            Visualize 2D claim clusters and isolate anomalies to accelerate suspicious-claim investigations.
          </p>
          <p>
            Use the location-adjusted amount metric to normalize spend by destination city/country cost levels.
          </p>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel" title="Outlier Mapping Controls">
        <div className="metric-grid compact">
          <article className="metric-card">
            <div className="metric-line"><span>Points In View</span><AnalyzeIcon className="metric-icon" /></div>
            <strong>{filteredPoints.length}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Total Outliers</span><RiskIcon className="metric-icon" /></div>
            <strong>{dashboard.outlier_points}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Outlier Ratio</span><OutlierIcon className="metric-icon" /></div>
            <strong>{dashboard.total_points ? ((dashboard.outlier_points / dashboard.total_points) * 100).toFixed(1) : '0.0'}%</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Cluster Count</span><OutlierIcon className="metric-icon" /></div>
            <strong>{dashboard.clusters.filter((item) => item.cluster_id >= 0).length}</strong>
          </article>
        </div>

        <div className="outlier-control-grid">
          <label>
            X-Axis Metric
            <select
              value={xMetric}
              onChange={(event) => {
                const nextValue = event.target.value
                if (nextValue === yMetric) return
                setXMetric(nextValue)
              }}
            >
              {dashboard.metric_options.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Y-Axis Metric
            <select
              value={yMetric}
              onChange={(event) => {
                const nextValue = event.target.value
                if (nextValue === xMetric) return
                setYMetric(nextValue)
              }}
            >
              {dashboard.metric_options.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Cluster Filter
            <select value={clusterFilter} onChange={(event) => setClusterFilter(event.target.value)}>
              <option value="all">All clusters</option>
              {dashboard.clusters.map((cluster) => (
                <option key={cluster.cluster_id} value={String(cluster.cluster_id)}>
                  {cluster.label} ({cluster.point_count})
                </option>
              ))}
            </select>
          </label>

          <label className="checkbox-inline">
            <input type="checkbox" checked={outliersOnly} onChange={(event) => setOutliersOnly(event.target.checked)} />
            Show outliers only
          </label>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel app-grow" title="2D Cluster and Outlier Map" allowFocusView>
        <div className="outlier-legend">
          {dashboard.clusters.map((cluster) => (
            <div key={cluster.cluster_id} className="outlier-legend-item">
              <span
                className="outlier-legend-dot"
                style={{
                  background: cluster.cluster_id === -1
                    ? '#b52735'
                    : CLUSTER_COLORS[cluster.cluster_id % CLUSTER_COLORS.length]
                }}
              />
              <span>{cluster.label} · {cluster.point_count}</span>
            </div>
          ))}
        </div>

        <div className="outlier-plot-frame">
          {filteredPoints.length === 0 ? (
            <p className="empty-muted">No points available for this metric/filter combination.</p>
          ) : (
            <svg
              className="outlier-plot-svg"
              viewBox={`0 0 ${plotWidth} ${plotHeight}`}
              role="img"
              aria-label="Outlier scatter plot"
              onMouseLeave={() => setHoveredClaimId(undefined)}
            >
              {xTicks.map((tick) => {
                const x = toX(tick)
                return (
                  <g key={`x-${tick.toFixed(4)}`}>
                    <line x1={x} y1={margin.top} x2={x} y2={margin.top + innerHeight} className="outlier-grid-line" />
                    <text x={x} y={plotHeight - 22} textAnchor="middle" className="outlier-axis-label">
                      {formatMetricValue(tick)}
                    </text>
                  </g>
                )
              })}

              {yTicks.map((tick) => {
                const y = toY(tick)
                return (
                  <g key={`y-${tick.toFixed(4)}`}>
                    <line x1={margin.left} y1={y} x2={margin.left + innerWidth} y2={y} className="outlier-grid-line" />
                    <text x={56} y={y + 4} textAnchor="end" className="outlier-axis-label">
                      {formatMetricValue(tick)}
                    </text>
                  </g>
                )
              })}

              <line x1={margin.left} y1={margin.top + innerHeight} x2={margin.left + innerWidth} y2={margin.top + innerHeight} className="outlier-axis-line" />
              <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + innerHeight} className="outlier-axis-line" />

              <text x={margin.left + innerWidth / 2} y={plotHeight - 6} textAnchor="middle" className="outlier-axis-title">
                {dashboard.x_label}
              </text>
              <text
                x={18}
                y={margin.top + innerHeight / 2}
                textAnchor="middle"
                className="outlier-axis-title"
                transform={`rotate(-90 18 ${margin.top + innerHeight / 2})`}
              >
                {dashboard.y_label}
              </text>

              {filteredPoints.map((point) => (
                <circle
                  key={point.claim_id}
                  cx={toX(point.x_value)}
                  cy={toY(point.y_value)}
                  r={point.outlier_flag ? 5.8 : 4.4}
                  fill={clusterColor(point)}
                  fillOpacity={point.outlier_flag ? 0.88 : 0.72}
                  stroke={point.outlier_flag ? '#7f1321' : '#ffffff'}
                  strokeWidth={point.outlier_flag ? 1.3 : 0.9}
                  onMouseEnter={() => setHoveredClaimId(point.claim_id)}
                >
                  <title>
                    {`${point.employee_name} (${point.employee_id}) · Claim ${point.claim_id}`}
                  </title>
                </circle>
              ))}
            </svg>
          )}
          {hoveredPoint && (
            <div className="outlier-hover-card outlier-hover-overlay">
              <strong>{hoveredPoint.employee_name} ({hoveredPoint.employee_id})</strong>
              <p>Claim: {hoveredPoint.claim_id} · Dept: {hoveredPoint.department}</p>
              <p>
                Location: {hoveredPoint.to_city || '-'}, {hoveredPoint.to_country || '-'} · Cost Factor {hoveredPoint.location_cost_factor.toFixed(2)}x
              </p>
              <p>
                {dashboard.x_label}: {formatMetricValue(hoveredPoint.x_value)} · {dashboard.y_label}: {formatMetricValue(hoveredPoint.y_value)}
              </p>
              <p>Distance Score: {hoveredPoint.distance_score.toFixed(2)} · Cluster {hoveredPoint.cluster_id >= 0 ? hoveredPoint.cluster_id + 1 : 'Outlier'}</p>
            </div>
          )}
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel table-panel app-grow" title="Top Outlier Claims" allowFocusView>
        <div className="panel-head">
          <div>
            <h3>Top Outlier Claims</h3>
            <p>Claims with the highest statistical distance in the selected 2D feature space.</p>
          </div>
        </div>

        <div className="table-wrap table-fill-wrap">
          <table className="table professional-table">
            <thead>
              <tr>
                <th>Claim</th>
                <th>Employee</th>
                <th>Department</th>
                <th>Location</th>
                <th>{dashboard.x_label}</th>
                <th>{dashboard.y_label}</th>
                <th>Distance</th>
                <th>Cluster</th>
                <th>Reasons</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {topOutliers.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-table">No outliers for current metrics.</td>
                </tr>
              )}
              {topOutliers.map((point) => (
                <tr key={point.claim_id} className={point.outlier_flag ? 'row-incorrect' : ''}>
                  <td>{point.claim_id}</td>
                  <td>
                    <strong>{point.employee_name}</strong>
                    <p>{point.employee_id}</p>
                  </td>
                  <td>{point.department}</td>
                  <td>{point.to_city || '-'}, {point.to_country || '-'}</td>
                  <td>{formatMetricValue(point.x_value)}</td>
                  <td>{formatMetricValue(point.y_value)}</td>
                  <td>{point.distance_score.toFixed(2)}</td>
                  <td>{point.cluster_id >= 0 ? `Cluster ${point.cluster_id + 1}` : 'Outlier'}</td>
                  <td>{point.outlier_reasons.join(' · ') || '—'}</td>
                  <td>
                    {point.incorrect_flag ? 'Incorrect' : point.suspicious_flag ? 'Suspicious' : 'Unflagged'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsiblePanel>
    </div>
  )
}
