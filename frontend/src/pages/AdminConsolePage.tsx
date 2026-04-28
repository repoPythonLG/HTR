import { FormEvent, useEffect, useState } from 'react'
import { fetchPolicyRules, fetchRiskSettings, fetchUsers, updateRiskSettings, upsertPolicyRule } from '../api/client'
import { AnalyzeIcon, PolicyIcon, RiskIcon, UsersIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { CurrentUser, PolicyRule, RiskSettings } from '../types'

export function AdminConsolePage() {
  const [rules, setRules] = useState<PolicyRule[]>([])
  const [users, setUsers] = useState<CurrentUser[]>([])
  const [selected, setSelected] = useState<PolicyRule>()
  const [riskSettings, setRiskSettings] = useState<RiskSettings>()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [riskMessage, setRiskMessage] = useState<string>()

  function refresh() {
    setError(undefined)
    Promise.all([fetchPolicyRules(), fetchUsers(), fetchRiskSettings()])
      .then(([ruleRows, userRows, settings]) => {
        setRules(ruleRows)
        setUsers(userRows)
        setRiskSettings(settings)
        setSelected((prev) => prev ?? ruleRows[0])
      })
      .catch((err) => setError(String(err)))
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!selected) return

    try {
      const payload = {
        key: selected.key,
        name: selected.name,
        category: selected.category,
        threshold: selected.threshold ?? null,
        unit: selected.unit ?? null,
        weight: selected.weight ?? null,
        enabled: selected.enabled,
        source: 'manual'
      }
      const saved = await upsertPolicyRule(payload)
      setMessage(`Rule ${saved.key} updated.`)
      refresh()
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleSaveRiskSettings(event: FormEvent) {
    event.preventDefault()
    if (!riskSettings) return

    try {
      const saved = await updateRiskSettings(riskSettings)
      setRiskSettings(saved)
      setRiskMessage('Risk settings updated.')
    } catch (err) {
      setError(String(err))
    }
  }

  if (error) return <div className="error-box">{error}</div>
  if (!selected || !riskSettings) return <div className="panel">Loading administrator console...</div>

  return (
    <div className="app-page admin-page">
      <PageTabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            eyebrow: 'Risk',
            children: (
              <CollapsiblePanel className="panel app-grow">
                <div className="panel-head">
                  <div>
                    <h2 className="section-title"><RiskIcon size={18} />Risk Detection Settings</h2>
                    <p>Configure outlier and mean-threshold detection for Excel travel travel expense entry analysis.</p>
                  </div>
                </div>
                {riskMessage && <div className="success-box">{riskMessage}</div>}
                <form className="form-grid" onSubmit={handleSaveRiskSettings}>
                  <div className="split-row">
                    <label>
                      Detection Method
                      <select
                        value={riskSettings.detection_mode}
                        onChange={(e) =>
                          setRiskSettings({
                            ...riskSettings,
                            detection_mode: e.target.value as RiskSettings['detection_mode']
                          })
                        }
                      >
                        <option value="combined">Combined (Outlier + Mean Threshold)</option>
                        <option value="outlier">Outlier and Abnormality Only</option>
                        <option value="mean_threshold">Mean Threshold Only</option>
                      </select>
                    </label>

                    <label>
                      Mean Threshold Percentage
                      <input
                        type="number"
                        min={0}
                        max={500}
                        step="0.1"
                        value={riskSettings.mean_threshold_pct}
                        onChange={(e) => setRiskSettings({ ...riskSettings, mean_threshold_pct: Number(e.target.value || 0) })}
                      />
                    </label>
                  </div>

                  <label>
                    Outlier Minimum Peer Sample Size
                    <input
                      type="number"
                      min={3}
                      max={500}
                      value={riskSettings.outlier_min_sample_size}
                      onChange={(e) => setRiskSettings({ ...riskSettings, outlier_min_sample_size: Number(e.target.value || 3) })}
                    />
                  </label>

                  <label>
                    Location-Adjusted Threshold Percentage
                    <input
                      type="number"
                      min={0}
                      max={500}
                      step="0.1"
                      value={riskSettings.location_adjusted_threshold_pct}
                      onChange={(e) => setRiskSettings({ ...riskSettings, location_adjusted_threshold_pct: Number(e.target.value || 0) })}
                    />
                  </label>

                  <button type="submit"><span className="btn-inline"><AnalyzeIcon size={14} />Save Risk Settings</span></button>
                </form>
              </CollapsiblePanel>
            )
          },
          {
            id: 'policy',
            label: 'Policy Rules',
            eyebrow: 'Engine',
            children: (
              <CollapsiblePanel className="panel two-col app-grow" allowFocusView>
                <article className="panel-scroll">
                  <h2 className="section-title"><PolicyIcon size={18} />Policy Engine Configuration</h2>
                  {message && <div className="success-box">{message}</div>}
                  <div className="rule-list">
                    {rules.map((rule) => (
                      <button
                        key={rule.rule_id}
                        className={`rule-item ${selected.rule_id === rule.rule_id ? 'active' : ''}`}
                        onClick={() => {
                          setSelected(rule)
                          setMessage(undefined)
                        }}
                      >
                        <strong>{rule.key}</strong>
                        <p>{rule.name}</p>
                      </button>
                    ))}
                  </div>
                </article>

                <article className="panel-scroll">
                  <h3 className="section-title"><PolicyIcon size={16} />Rule Editor</h3>
                  <form className="form-grid" onSubmit={handleSave}>
                    <label>
                      Key
                      <input value={selected.key} disabled />
                    </label>
                    <label>
                      Name
                      <input value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })} />
                    </label>
                    <label>
                      Category
                      <input value={selected.category} onChange={(e) => setSelected({ ...selected, category: e.target.value })} />
                    </label>
                    <div className="split-row">
                      <label>
                        Threshold
                        <input
                          type="number"
                          value={selected.threshold ?? ''}
                          onChange={(e) => setSelected({ ...selected, threshold: e.target.value ? Number(e.target.value) : null })}
                        />
                      </label>
                      <label>
                        Weight
                        <input
                          type="number"
                          value={selected.weight ?? ''}
                          onChange={(e) => setSelected({ ...selected, weight: e.target.value ? Number(e.target.value) : null })}
                        />
                      </label>
                    </div>
                    <label>
                      Unit
                      <input value={selected.unit ?? ''} onChange={(e) => setSelected({ ...selected, unit: e.target.value || null })} />
                    </label>
                    <label className="checkbox-inline">
                      <input type="checkbox" checked={selected.enabled} onChange={(e) => setSelected({ ...selected, enabled: e.target.checked })} />
                      Rule enabled
                    </label>
                    <button type="submit"><span className="btn-inline"><PolicyIcon size={14} />Save Rule</span></button>
                  </form>
                </article>
              </CollapsiblePanel>
            )
          },
          {
            id: 'users',
            label: 'Users',
            eyebrow: 'Access',
            children: (
              <CollapsiblePanel className="panel table-panel app-grow" allowFocusView>
                <h3 className="section-title"><UsersIcon size={16} />User and Role Registry</h3>
                <div className="table-wrap table-fill-wrap">
                  <table className="table professional-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Employee Code</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.user_id}>
                          <td>{user.full_name}</td>
                          <td>{user.username}</td>
                          <td>{user.role}</td>
                          <td>{user.employee_code || '-'}</td>
                          <td>{user.is_active ? 'Active' : 'Inactive'}</td>
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
