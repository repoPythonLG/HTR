import { FormEvent, useEffect, useState } from 'react'
import { fetchPolicyRules, fetchRiskSettings, fetchUsers, updateRiskSettings, upsertPolicyRule } from '../api/client'
import { AnalyzeIcon, PolicyIcon, RiskIcon, UsersIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { PageTabs } from '../components/PageTabs'
import { CurrentUser, PolicyRule, RiskSettings } from '../types'

type PolicyViewMode = 'simple' | 'advanced'

type PolicyRuleMeta = {
  title: string
  description: string
  valueLabel?: string
  helpText?: string
}

type SimplePolicyField = {
  ruleKey: string
  valueType: 'threshold' | 'weight'
  label: string
  helpText: string
  min?: number
  max?: number
  step?: string
}

type SimplePolicyGroup = {
  id: string
  title: string
  description: string
  primaryRuleKey: string
  fields: SimplePolicyField[]
}

const POLICY_RULE_META: Record<string, PolicyRuleMeta> = {
  mean_threshold_pct: {
    title: 'Daily cost above similar trips',
    description: 'Flags an entry when its cost per travel day is above comparable entries by this percentage.',
    valueLabel: 'Allowed increase above similar daily costs (%)',
    helpText: 'Example: 10 means the entry is highlighted once the daily cost is more than 10% above similar trips.'
  },
  location_adjusted_threshold_pct: {
    title: 'Destination-adjusted daily cost',
    description: 'Checks daily cost after allowing for the destination city or country being more or less expensive.',
    valueLabel: 'Allowed increase after destination adjustment (%)',
    helpText: 'Use this for fair comparisons between destinations such as Riyadh, London, Doha, or Phoenix.'
  },
  outlier_min_sample_size: {
    title: 'Minimum similar entries for comparison',
    description: 'Sets how many comparable entries are needed before the system trusts a statistical comparison.',
    valueLabel: 'Minimum comparison group size',
    helpText: 'Higher values reduce false positives, but very high values may skip smaller travel groups.'
  },
  weight_amount_above_peer_mean_threshold: {
    title: 'Importance: daily cost above peer average',
    description: 'Controls how much risk score is added when daily cost exceeds the allowed peer-average limit.',
    valueLabel: 'Risk points to add',
    helpText: 'Increase this if HR wants above-average daily costs to be treated as more serious.'
  },
  weight_location_cost_anomaly: {
    title: 'Importance: destination-adjusted cost issue',
    description: 'Controls the risk score added when the daily cost still looks high after destination adjustment.',
    valueLabel: 'Risk points to add',
    helpText: 'This is useful when the destination alone does not explain a high daily cost.'
  },
  weight_overlapping_trips: {
    title: 'Importance: overlapping trip dates',
    description: 'Controls the risk score added when the same employee has travel entries with overlapping dates.',
    valueLabel: 'Risk points to add',
    helpText: 'Keep this visible because overlapping dates are easy for reviewers to understand and verify.'
  },
  weight_amount_outlier_abnormality: {
    title: 'Importance: unusual daily cost pattern',
    description: 'Adds risk when the daily cost is statistically far away from similar travel entries.',
    valueLabel: 'Risk points to add',
    helpText: 'This catches unusual costs even when they are not only slightly above the peer average.'
  },
  approval_threshold: {
    title: 'Approval amount reference',
    description: 'Reference approval amount used by legacy approval-threshold checks. It is not part of the main daily-cost review.'
  },
  hotel_deviation_pct: {
    title: 'Accommodation benchmark variance',
    description: 'Legacy hotel benchmark percentage. The current review focuses on total travel cost per day instead.'
  },
  weekend_buffer_days: {
    title: 'Legacy duration buffer',
    description: 'Inactive duration setting. Long trips are not treated as risky by themselves.'
  },
  near_threshold_pct: {
    title: 'Near approval limit check',
    description: 'Legacy check for entries close to an approval limit. It is not central to the current cost-per-day model.'
  },
  approver_exception_threshold: {
    title: 'Approver exception count',
    description: 'Counts repeated exception patterns for approvers. Usually reviewed by audit or governance users only.'
  },
  risk_critical_min: {
    title: 'Critical risk score starts at',
    description: 'Score at which an entry is labelled Critical in queues and dashboards.'
  },
  risk_detection_mode_code: {
    title: 'Detection mode code',
    description: 'Technical setting used by the engine to choose the active detection method.'
  },
  weight_duplicate_receipt: {
    title: 'Importance: duplicate supporting evidence',
    description: 'Adds risk when supporting evidence appears duplicated or reused.'
  },
  weight_hotel_above_benchmark: {
    title: 'Importance: accommodation benchmark issue',
    description: 'Legacy benchmark weight. The current model prioritises total travel cost per day.'
  },
  weight_near_approval_threshold: {
    title: 'Importance: near approval limit',
    description: 'Inactive legacy score for entries close to approval limits.'
  },
  weight_extended_stay: {
    title: 'Importance: extended stay',
    description: 'Inactive duration score. Trip length alone should not create risk in the current model.'
  },
  weight_meal_double_claim: {
    title: 'Importance: duplicate meal entry',
    description: 'Adds risk when meals appear claimed more than once.'
  },
  weight_non_compliant_booking: {
    title: 'Importance: non-compliant booking',
    description: 'Adds risk when booking evidence appears outside approved travel policy channels.'
  },
  weight_business_class_travel: {
    title: 'Importance: business-class travel',
    description: 'Adds risk when business-class travel appears where policy may not allow it.'
  },
  weight_vendor_concentration: {
    title: 'Importance: vendor concentration',
    description: 'Inactive in the current model because vendor concentration is not meaningful for this travel-expense dataset.'
  },
  weight_approver_exception_pattern: {
    title: 'Importance: approver exception pattern',
    description: 'Adds risk when repeated approval exceptions appear around the same reviewer or approver.'
  },
  weight_trip_duration_outlier_abnormality: {
    title: 'Importance: trip duration outlier',
    description: 'Inactive duration score. Long trips can be valid, so cost per day is the primary focus.'
  }
}

const SIMPLE_POLICY_GROUPS: SimplePolicyGroup[] = [
  {
    id: 'daily-cost',
    title: 'Daily cost above similar trips',
    description: 'Compares cost per day against similar travel entries and adds risk when the daily cost is too high.',
    primaryRuleKey: 'mean_threshold_pct',
    fields: [
      {
        ruleKey: 'mean_threshold_pct',
        valueType: 'threshold',
        label: 'Allowed increase above similar daily costs (%)',
        helpText: 'Example: 10 means the entry is highlighted once daily cost is more than 10% above similar trips.',
        min: 0,
        max: 500,
        step: '0.1'
      },
      {
        ruleKey: 'weight_amount_above_peer_mean_threshold',
        valueType: 'weight',
        label: 'Risk importance when this happens',
        helpText: 'Risk points added when an entry exceeds the allowed daily-cost limit.',
        min: 0,
        max: 100,
        step: '1'
      }
    ]
  },
  {
    id: 'location-daily-cost',
    title: 'Destination-adjusted daily cost',
    description: 'Checks whether the daily cost still looks high after allowing for city or country cost differences.',
    primaryRuleKey: 'location_adjusted_threshold_pct',
    fields: [
      {
        ruleKey: 'location_adjusted_threshold_pct',
        valueType: 'threshold',
        label: 'Allowed increase after destination adjustment (%)',
        helpText: 'Use this for fair comparisons between destinations such as Riyadh, London, Doha, or Phoenix.',
        min: 0,
        max: 500,
        step: '0.1'
      },
      {
        ruleKey: 'weight_location_cost_anomaly',
        valueType: 'weight',
        label: 'Risk importance when this happens',
        helpText: 'Risk points added when location cost alone does not explain the high daily cost.',
        min: 0,
        max: 100,
        step: '1'
      }
    ]
  },
  {
    id: 'unusual-daily-cost',
    title: 'Unusual daily cost pattern',
    description: 'Looks for daily costs that are statistically far away from comparable travel entries.',
    primaryRuleKey: 'outlier_min_sample_size',
    fields: [
      {
        ruleKey: 'outlier_min_sample_size',
        valueType: 'threshold',
        label: 'Minimum similar entries before using this check',
        helpText: 'Higher values reduce false positives, but very high values may skip smaller travel groups.',
        min: 3,
        max: 500,
        step: '1'
      },
      {
        ruleKey: 'weight_amount_outlier_abnormality',
        valueType: 'weight',
        label: 'Risk importance when this happens',
        helpText: 'Risk points added when the daily cost is unusually far from the comparison group.',
        min: 0,
        max: 100,
        step: '1'
      }
    ]
  },
  {
    id: 'overlapping-trips',
    title: 'Overlapping trip dates',
    description: 'Adds risk when the same employee has travel entries with overlapping dates.',
    primaryRuleKey: 'weight_overlapping_trips',
    fields: [
      {
        ruleKey: 'weight_overlapping_trips',
        valueType: 'weight',
        label: 'Risk importance when this happens',
        helpText: 'Keep this high when overlapping travel dates should always be reviewed.',
        min: 0,
        max: 100,
        step: '1'
      }
    ]
  }
]

function getRuleMeta(rule: PolicyRule): PolicyRuleMeta {
  return (
    POLICY_RULE_META[rule.key] ?? {
      title: rule.name,
      description: 'Advanced policy setting used by the risk engine. Keep unchanged unless the audit team has requested it.'
    }
  )
}

function formatRuleValue(rule: PolicyRule) {
  if (rule.threshold !== null && rule.threshold !== undefined) {
    return `${rule.threshold}${rule.unit === 'pct' ? '%' : rule.unit ? ` ${rule.unit}` : ''}`
  }
  if (rule.weight !== null && rule.weight !== undefined) {
    return `${rule.weight} pts`
  }
  return 'No value'
}

function getRuleByKey(rules: PolicyRule[], key: string) {
  return rules.find((rule) => rule.key === key)
}

function formatSimpleGroupValue(group: SimplePolicyGroup, rules: PolicyRule[]) {
  return group.fields
    .map((field) => {
      const rule = getRuleByKey(rules, field.ruleKey)
      if (!rule) return undefined
      return formatRuleValue(rule)
    })
    .filter(Boolean)
    .join(' / ')
}

export function AdminConsolePage() {
  const [rules, setRules] = useState<PolicyRule[]>([])
  const [users, setUsers] = useState<CurrentUser[]>([])
  const [selected, setSelected] = useState<PolicyRule>()
  const [riskSettings, setRiskSettings] = useState<RiskSettings>()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [riskMessage, setRiskMessage] = useState<string>()
  const [policyViewMode, setPolicyViewMode] = useState<PolicyViewMode>('simple')
  const [selectedPolicyGroupId, setSelectedPolicyGroupId] = useState(SIMPLE_POLICY_GROUPS[0].id)
  const selectedPolicyGroup = SIMPLE_POLICY_GROUPS.find((group) => group.id === selectedPolicyGroupId) ?? SIMPLE_POLICY_GROUPS[0]

  function refresh() {
    setError(undefined)
    Promise.all([fetchPolicyRules(), fetchUsers(), fetchRiskSettings()])
      .then(([ruleRows, userRows, settings]) => {
        setRules(ruleRows)
        setUsers(userRows)
        setRiskSettings(settings)
        setSelected((prev) =>
          prev
            ? ruleRows.find((rule) => rule.rule_id === prev.rule_id || rule.key === prev.key) ??
              ruleRows.find((rule) => rule.key === SIMPLE_POLICY_GROUPS[0].primaryRuleKey) ??
              ruleRows[0]
            : ruleRows.find((rule) => rule.key === SIMPLE_POLICY_GROUPS[0].primaryRuleKey) ?? ruleRows[0]
        )
      })
      .catch((err) => setError(String(err)))
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (policyViewMode === 'advanced' && rules.length && !selected) {
      setSelected(rules[0])
    }
  }, [policyViewMode, rules, selected])

  function updateRuleValue(ruleKey: string, valueType: SimplePolicyField['valueType'], rawValue: string) {
    const value = rawValue ? Number(rawValue) : null
    setRules((currentRules) =>
      currentRules.map((rule) =>
        rule.key === ruleKey
          ? {
              ...rule,
              [valueType]: value
            }
          : rule
      )
    )
    setSelected((currentRule) =>
      currentRule?.key === ruleKey
        ? {
            ...currentRule,
            [valueType]: value
          }
        : currentRule
    )
  }

  async function saveRule(rule: PolicyRule) {
    return upsertPolicyRule({
      key: rule.key,
      name: rule.name,
      category: rule.category,
      threshold: rule.threshold ?? null,
      unit: rule.unit ?? null,
      weight: rule.weight ?? null,
      enabled: rule.enabled,
      source: 'manual'
    })
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()

    try {
      if (policyViewMode === 'simple') {
        const rulesToSave = selectedPolicyGroup.fields
          .map((field) => getRuleByKey(rules, field.ruleKey))
          .filter((rule): rule is PolicyRule => Boolean(rule))
        await Promise.all(rulesToSave.map(saveRule))
        setMessage(`${selectedPolicyGroup.title} updated.`)
        refresh()
        return
      }

      if (!selected) return
      const saved = await saveRule(selected)
      setMessage(`${getRuleMeta(saved).title} updated.`)
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
              <CollapsiblePanel className="panel risk-settings-panel" title="Risk Detection Settings">
                <div className="panel-head">
                  <div>
                    <h2 className="section-title"><RiskIcon size={18} />Risk Detection Settings</h2>
                    <p>Configure daily-cost outlier and peer-threshold detection for imported travel expense entries.</p>
                  </div>
                </div>
                {riskMessage && <div className="success-box">{riskMessage}</div>}
                <form className="form-grid risk-settings-form" onSubmit={handleSaveRiskSettings}>
                  <div className="split-row">
                    <label>
                      Detection approach
                      <span className="field-description">Choose whether the system uses average daily-cost checks, statistical outliers, or both.</span>
                      <select
                        value={riskSettings.detection_mode}
                        onChange={(e) =>
                          setRiskSettings({
                            ...riskSettings,
                            detection_mode: e.target.value as RiskSettings['detection_mode']
                          })
                        }
                      >
                        <option value="combined">Recommended: average check + unusual pattern check</option>
                        <option value="outlier">Unusual pattern check only</option>
                        <option value="mean_threshold">Average daily-cost check only</option>
                      </select>
                    </label>

                    <label>
                      Daily cost above similar trips (%)
                      <span className="field-description">Highlights entries when cost per day is above comparable trips by this percentage.</span>
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
                    Minimum similar entries for comparison
                    <span className="field-description">The system needs at least this many similar trips before it trusts the comparison.</span>
                    <input
                      type="number"
                      min={3}
                      max={500}
                      value={riskSettings.outlier_min_sample_size}
                      onChange={(e) => setRiskSettings({ ...riskSettings, outlier_min_sample_size: Number(e.target.value || 3) })}
                    />
                  </label>

                  <label>
                    Destination-adjusted daily cost (%)
                    <span className="field-description">Highlights entries that remain expensive even after allowing for city or country cost differences.</span>
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
                  <div className="policy-toolbar">
                    <div>
                      <h2 className="section-title"><PolicyIcon size={18} />Policy Engine Configuration</h2>
                      <p>
                        Simple view shows the main HR controls: cost per day, destination-adjusted cost per day, and overlapping trip dates.
                      </p>
                    </div>
                    <div className="policy-mode-toggle" aria-label="Policy configuration view">
                      <button
                        type="button"
                        className={policyViewMode === 'simple' ? 'active' : ''}
                        onClick={() => setPolicyViewMode('simple')}
                      >
                        Simple
                      </button>
                      <button
                        type="button"
                        className={policyViewMode === 'advanced' ? 'active' : ''}
                        onClick={() => setPolicyViewMode('advanced')}
                      >
                        Advanced
                      </button>
                    </div>
                  </div>
                  {message && <div className="success-box">{message}</div>}
                  <div className="rule-list">
                    {policyViewMode === 'simple'
                      ? SIMPLE_POLICY_GROUPS.map((group) => (
                          <button
                            key={group.id}
                            className={`rule-item ${selectedPolicyGroupId === group.id ? 'active' : ''}`}
                            type="button"
                            onClick={() => {
                              setSelectedPolicyGroupId(group.id)
                              const primaryRule = getRuleByKey(rules, group.primaryRuleKey)
                              if (primaryRule) setSelected(primaryRule)
                              setMessage(undefined)
                            }}
                          >
                            <span className="rule-item-topline">
                              <strong>{group.title}</strong>
                              <span>{formatSimpleGroupValue(group, rules)}</span>
                            </span>
                            <p>{group.description}</p>
                          </button>
                        ))
                      : rules.map((rule) => {
                          const meta = getRuleMeta(rule)
                          return (
                            <button
                              key={rule.rule_id}
                              className={`rule-item ${selected.rule_id === rule.rule_id ? 'active' : ''}`}
                              type="button"
                              onClick={() => {
                                setSelected(rule)
                                setMessage(undefined)
                              }}
                            >
                              <span className="rule-item-topline">
                                <strong>{meta.title}</strong>
                                <span>{formatRuleValue(rule)}</span>
                              </span>
                              <p>{meta.description}</p>
                              <small>{rule.key}</small>
                            </button>
                          )
                        })}
                  </div>
                </article>

                <article className="panel-scroll">
                  <h3 className="section-title"><PolicyIcon size={16} />Rule Editor</h3>
                  <div className="rule-editor-summary">
                    <span>{policyViewMode === 'simple' ? 'Plain-English policy' : 'Advanced rule'}</span>
                    <strong>{policyViewMode === 'simple' ? selectedPolicyGroup.title : getRuleMeta(selected).title}</strong>
                    <p>{policyViewMode === 'simple' ? selectedPolicyGroup.description : getRuleMeta(selected).description}</p>
                  </div>
                  <form className="form-grid" onSubmit={handleSave}>
                    {policyViewMode === 'simple' ? (
                      <div className="policy-combined-fields">
                        {selectedPolicyGroup.fields.map((field) => {
                          const rule = getRuleByKey(rules, field.ruleKey)
                          return (
                            <label key={`${field.ruleKey}-${field.valueType}`}>
                              {field.label}
                              <span className="field-description">{field.helpText}</span>
                              <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                value={rule?.[field.valueType] ?? ''}
                                onChange={(e) => updateRuleValue(field.ruleKey, field.valueType, e.target.value)}
                              />
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      <>
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
                        {getRuleMeta(selected).helpText && <p className="policy-field-help">{getRuleMeta(selected).helpText}</p>}
                        <label>
                          Unit
                          <input value={selected.unit ?? ''} onChange={(e) => setSelected({ ...selected, unit: e.target.value || null })} />
                        </label>
                        <label className="checkbox-inline">
                          <input type="checkbox" checked={selected.enabled} onChange={(e) => setSelected({ ...selected, enabled: e.target.checked })} />
                          Rule enabled
                        </label>
                      </>
                    )}
                    <button type="submit"><span className="btn-inline"><PolicyIcon size={14} />Save {policyViewMode === 'simple' ? 'Policy' : 'Rule'}</span></button>
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
