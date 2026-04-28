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
