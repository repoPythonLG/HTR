import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchModelGovernance } from '../api/client'
import { AnalyzeIcon, PolicyIcon, RiskIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { useAuth } from '../context/AuthContext'
import { ModelGovernance, ModelGovernanceMethod } from '../types'

function methodStatusClass(status: string) {
  const value = status.toLowerCase()
  if (value === 'active' || value === 'enforced' || value === 'tracked') return 'chip low'
  if (value === 'configurable' || value === 'available') return 'chip medium'
  return 'chip high'
}

function detectionModeLabel(mode: string) {
  if (mode === 'combined') return 'Combined outlier + mean threshold'
  if (mode === 'outlier') return 'Outlier and abnormality only'
  if (mode === 'mean_threshold') return 'Peer mean threshold only'
  return mode
}

function formatDate(value?: string | null) {
  if (!value) return 'No assessments yet'
  return dayjs(value).format('DD MMM YYYY HH:mm')
}

function formatRuleValue(value?: number | null, unit?: string | null, weight?: number | null) {
  if (weight !== null && weight !== undefined) return `${weight.toLocaleString('en-GB')} score weight`
  if (value !== null && value !== undefined) return `${value.toLocaleString('en-GB')} ${unit || ''}`.trim()
  return 'Reference rule'
}

function MethodCard({ method, selected, onSelect }: { method: ModelGovernanceMethod; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`governance-method-card ${selected ? 'is-active' : ''}`} onClick={onSelect}>
      <span className={methodStatusClass(method.status)}>{method.status}</span>
      <strong>{method.name}</strong>
      <p>{method.purpose}</p>
    </button>
  )
}

export function ModelGovernancePage() {
  const { user } = useAuth()
  const [governance, setGovernance] = useState<ModelGovernance>()
  const [selectedMethodKey, setSelectedMethodKey] = useState('amount_outlier')
  const [thresholdSearch, setThresholdSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(undefined)
    fetchModelGovernance()
      .then((data) => {
        setGovernance(data)
        setSelectedMethodKey(data.methods[0]?.key || 'amount_outlier')
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  const selectedMethod = useMemo(() => {
    return governance?.methods.find((method) => method.key === selectedMethodKey) || governance?.methods[0]
  }, [governance, selectedMethodKey])

  const thresholdCategories = useMemo(() => {
    const values = new Set((governance?.thresholds || []).map((threshold) => threshold.category))
    return ['all', ...Array.from(values).sort()]
  }, [governance])

  const filteredThresholds = useMemo(() => {
    const query = thresholdSearch.trim().toLowerCase()
    return (governance?.thresholds || []).filter((threshold) => {
      if (categoryFilter !== 'all' && threshold.category !== categoryFilter) return false
      if (!query) return true
      return (
        threshold.key.toLowerCase().includes(query) ||
        threshold.name.toLowerCase().includes(query) ||
        threshold.category.toLowerCase().includes(query)
      )
    })
  }, [governance, categoryFilter, thresholdSearch])

  if (loading) return <div className="panel">Loading model governance...</div>
  if (error) return <div className="error-box">{error}</div>
  if (!governance || !selectedMethod) return <div className="panel">No governance data available.</div>

  const isAdministrator = user?.role === 'administrator'

  return (
    <div className="app-page governance-page">
      <CollapsiblePanel className="panel hero-panel governance-hero" title="Model Governance Overview">
        <div>
          <p className="eyebrow">Model Governance and Explainability</p>
          <h2>Detection Methods, Thresholds, and Version Control</h2>
          <p>
            Audit-ready overview of how ClaimGuard flags suspicious reimbursement claims, which thresholds are active,
            and which rules version generated historical risk decisions.
          </p>
        </div>
        <div className="hero-actions governance-hero-actions">
          <span className="chip low">{governance.current_model_version}</span>
          {isAdministrator && <Link className="text-link" to="/admin">Edit policy rules</Link>}
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel" title="Governance Snapshot">
        <div className="metric-grid compact governance-kpis">
          <article className="metric-card">
            <div className="metric-line"><span>Current Detection Mode</span><RiskIcon className="metric-icon" /></div>
            <strong>{detectionModeLabel(governance.detection_mode)}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Generated Assessments</span><AnalyzeIcon className="metric-icon" /></div>
            <strong>{governance.generated_assessments.toLocaleString('en-GB')}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Enabled Policy Rules</span><PolicyIcon className="metric-icon" /></div>
            <strong>{governance.enabled_policy_rule_count}/{governance.policy_rule_count}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-line"><span>Latest Assessment</span><AnalyzeIcon className="metric-icon" /></div>
            <strong>{formatDate(governance.latest_assessment_at)}</strong>
          </article>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel two-col app-grow governance-method-panel" title="Detection Method Explainability" allowFocusView>
        <article className="panel-scroll">
          <div className="section-title-row">
            <h3 className="section-title"><RiskIcon size={16} />Detection Methods</h3>
            <span className="source-ref-pill">{governance.methods.length} methods</span>
          </div>
          <div className="governance-method-list">
            {governance.methods.map((method) => (
              <MethodCard
                key={method.key}
                method={method}
                selected={method.key === selectedMethod.key}
                onSelect={() => setSelectedMethodKey(method.key)}
              />
            ))}
          </div>
        </article>

        <article className="panel-scroll governance-method-detail">
          <div className="section-title-row">
            <h3>{selectedMethod.name}</h3>
            <span className={methodStatusClass(selectedMethod.status)}>{selectedMethod.status}</span>
          </div>
          <section className="governance-explainer-card">
            <p className="eyebrow">How it works</p>
            <p>{selectedMethod.how_it_works}</p>
          </section>
          <section className="governance-explainer-card">
            <p className="eyebrow">Reviewer interpretation</p>
            <p>{selectedMethod.reviewer_interpretation}</p>
          </section>
          <div className="governance-detail-grid">
            <section className="governance-explainer-card">
              <p className="eyebrow">Primary inputs</p>
              <div className="tag-cloud">
                {selectedMethod.primary_inputs.map((input) => <span key={input}>{input}</span>)}
              </div>
            </section>
            <section className="governance-explainer-card">
              <p className="eyebrow">Relevant thresholds</p>
              <div className="tag-cloud">
                {selectedMethod.thresholds.map((threshold) => <span key={threshold}>{threshold}</span>)}
              </div>
            </section>
          </div>
          <section className="governance-explainer-card">
            <p className="eyebrow">Known limitations and reviewer safeguards</p>
            <ul className="governance-limit-list">
              {selectedMethod.limitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </article>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel table-panel app-grow" title="Threshold and Weight Register" allowFocusView>
        <div className="panel-head governance-table-head">
          <div>
            <h3 className="section-title"><PolicyIcon size={16} />Threshold and Weight Register</h3>
            <p>Operational policy rules used by the scoring engine. Administrators can edit these in the Administrator Console.</p>
          </div>
          <div className="governance-filter-row">
            <label>
              Search Rules
              <input value={thresholdSearch} onChange={(event) => setThresholdSearch(event.target.value)} placeholder="mean, location, weight..." />
            </label>
            <label>
              Category
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                {thresholdCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="table-wrap table-fill-wrap">
          <table className="table professional-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Category</th>
                <th>Configured Value</th>
                <th>Status</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredThresholds.map((threshold) => (
                <tr key={threshold.key}>
                  <td>
                    <strong>{threshold.name}</strong>
                    <p>{threshold.key}</p>
                  </td>
                  <td>{threshold.category}</td>
                  <td>{formatRuleValue(threshold.value, threshold.unit, threshold.weight)}</td>
                  <td><span className={threshold.enabled ? 'chip low' : 'chip high'}>{threshold.enabled ? 'Enabled' : 'Disabled'}</span></td>
                  <td>{threshold.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel two-col app-grow" title="Version History and Governance Controls" allowFocusView>
        <article className="panel-scroll">
          <h3 className="section-title"><AnalyzeIcon size={16} />Version History</h3>
          <div className="version-history-list">
            {governance.version_history.length === 0 && <p className="empty-muted">No risk assessments have been generated yet.</p>}
            {governance.version_history.map((version) => (
              <section className="version-card" key={version.model_version}>
                <div className="version-card-head">
                  <strong>{version.model_version}</strong>
                  <span className="source-ref-pill">{version.assessments.toLocaleString('en-GB')} assessments</span>
                </div>
                <dl className="fact-grid compact">
                  <div className="fact-item"><dt>First Used</dt><dd>{formatDate(version.first_used_at)}</dd></div>
                  <div className="fact-item"><dt>Last Used</dt><dd>{formatDate(version.last_used_at)}</dd></div>
                  <div className="fact-item"><dt>Average Risk</dt><dd>{version.average_risk_score.toFixed(2)}</dd></div>
                  <div className="fact-item"><dt>Version Status</dt><dd>{version.model_version === governance.current_model_version ? 'Current' : 'Historical'}</dd></div>
                </dl>
              </section>
            ))}
          </div>
        </article>

        <article className="panel-scroll">
          <h3 className="section-title"><PolicyIcon size={16} />Governance Controls</h3>
          <div className="governance-control-list">
            {governance.controls.map((control) => (
              <section className="control-card" key={control.name}>
                <div className="control-head">
                  <strong>{control.name}</strong>
                  <span className={methodStatusClass(control.status)}>{control.status}</span>
                </div>
                <p>{control.evidence}</p>
                <span className="source-ref-pill">Owner: {control.owner}</span>
              </section>
            ))}
          </div>
        </article>
      </CollapsiblePanel>
    </div>
  )
}
