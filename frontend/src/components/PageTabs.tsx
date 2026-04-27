import { ReactNode, useEffect, useState } from 'react'

type PageTab = {
  id: string
  label: string
  eyebrow?: string
  children: ReactNode
}

type PageTabsProps = {
  tabs: PageTab[]
  defaultTabId?: string
  className?: string
}

export function PageTabs({ tabs, defaultTabId, className = '' }: PageTabsProps) {
  const [activeTabId, setActiveTabId] = useState(defaultTabId || tabs[0]?.id || '')

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(defaultTabId || tabs[0]?.id || '')
    }
  }, [activeTabId, defaultTabId, tabs])

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0]

  if (!activeTab) return null

  return (
    <div className={`page-tabs ${className}`.trim()}>
      <div className="page-tab-list" role="tablist" aria-label="Page sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`page-tab-button${tab.id === activeTab.id ? ' is-active' : ''}`}
            role="tab"
            aria-selected={tab.id === activeTab.id}
            aria-controls={`tab-panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.eyebrow && <span>{tab.eyebrow}</span>}
            <strong>{tab.label}</strong>
          </button>
        ))}
      </div>

      <div
        className="page-tab-panel"
        role="tabpanel"
        id={`tab-panel-${activeTab.id}`}
        aria-labelledby={`tab-${activeTab.id}`}
      >
        {activeTab.children}
      </div>
    </div>
  )
}
