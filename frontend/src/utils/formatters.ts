const TOKEN_LABELS: Record<string, string> = {
  ai: 'AI',
  api: 'API',
  hr: 'HR',
  id: 'ID',
  kpi: 'KPI',
  sar: 'SAR',
  uae: 'UAE',
  uk: 'UK',
  usa: 'USA'
}

export function formatDetectionType(value?: string | null): string {
  if (!value) return '-'
  const normalized = value.trim()
  if (!normalized) return '-'

  const explicitLabels: Record<string, string> = {
    amount_outlier_abnormality: 'Daily Cost Outlier',
    amount_above_peer_mean_threshold: 'Daily Cost Above Peer Mean',
    location_cost_anomaly: 'Location-Adjusted Daily Cost Anomaly',
    near_approval_threshold: 'Inactive Total Threshold Rule',
    extended_stay: 'Inactive Duration Rule',
    trip_duration_outlier_abnormality: 'Inactive Duration Outlier Rule',
    vendor_concentration: 'Inactive Vendor Concentration Rule'
  }
  const explicit = explicitLabels[normalized.toLowerCase()]
  if (explicit) return explicit

  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((token) => {
      const lowered = token.toLowerCase()
      const label = TOKEN_LABELS[lowered]
      if (label) return label
      return lowered.charAt(0).toUpperCase() + lowered.slice(1)
    })
    .join(' ')
    .replace(/\bClaims\b/g, 'Travel Expense Entries')
    .replace(/\bClaim\b/g, 'Travel Expense Entry')
    .replace(/\bReceipts\b/g, 'Entries')
    .replace(/\bReceipt\b/g, 'Entry')
}
