import { ReactNode, useEffect, useRef, useState } from 'react'

type CollapsiblePanelProps = {
  className?: string
  children: ReactNode
  defaultCollapsed?: boolean
  title?: string
  allowFocusView?: boolean
  collapsible?: boolean
}

export function CollapsiblePanel({
  className = 'panel',
  children,
  defaultCollapsed = false,
  title,
  allowFocusView = false,
  collapsible = true
}: CollapsiblePanelProps) {
  const panelRef = useRef<HTMLElement | null>(null)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [collapsedTitle, setCollapsedTitle] = useState(title || 'Insights Section')
  const [focused, setFocused] = useState(false)

  const panelClassName = `${className} collapsible-panel${collapsed ? ' is-collapsed' : ''}${focused ? ' is-focus-view' : ''}`.trim()

  function fallbackTitle(): string {
    if (className.includes('claims-workbench-panel')) return 'Travel Expense Entry Workbench'
    if (className.includes('employee-risk-spotlight')) return 'Employee Risk Spotlight'
    if (className.includes('intake-last-import-panel')) return 'Last Imported Spreadsheet'
    if (className.includes('table-panel')) return 'Data Table'
    if (className.includes('hero-panel')) return 'Executive Overview'
    if (className.includes('two-col')) return 'Comparative Insights'
    if (className.includes('app-grow')) return 'Performance Overview'
    return 'Insights Section'
  }

  function resolvePanelTitle(): string {
    if (title && title.trim()) return title.trim()

    const root = panelRef.current
    if (!root) return fallbackTitle()

    const heading = root.querySelector<HTMLElement>('h1, h2, h3, h4, .section-title')
    const text = (heading?.textContent || '').replace(/\s+/g, ' ').trim()
    return text || fallbackTitle()
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      if (next) {
        setCollapsedTitle(resolvePanelTitle())
        setFocused(false)
      }
      return next
    })
  }

  function toggleFocusView() {
    setFocused((current) => {
      const next = !current
      if (next) {
        setCollapsed(false)
      }
      return next
    })
  }

  useEffect(() => {
    const root = panelRef.current?.closest('.app-page')
    if (!root) return

    if (focused) {
      root.classList.add('has-focused-panel')
    } else if (!root.querySelector('.collapsible-panel.is-focus-view')) {
      root.classList.remove('has-focused-panel')
    }

    return () => {
      if (!root.querySelector('.collapsible-panel.is-focus-view')) {
        root.classList.remove('has-focused-panel')
      }
    }
  }, [focused])

  return (
    <section ref={panelRef} className={panelClassName}>
      <div className="panel-control-group">
        {allowFocusView && (
          <button
            type="button"
            className="panel-icon-btn panel-focus-btn"
            onClick={toggleFocusView}
            title={focused ? 'Exit focused panel view' : 'Expand panel to focused view'}
            aria-label={focused ? 'Exit focused panel view' : 'Expand panel to focused view'}
            aria-pressed={focused}
          >
            <span className={`panel-focus-icon${focused ? ' is-active' : ''}`} aria-hidden="true">
              {focused ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6.5" y="6.5" width="11" height="11" rx="1.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 9V4.5h4.5" />
                  <path d="M19.5 15v4.5H15" />
                  <path d="M15 4.5h4.5V9" />
                  <path d="M9 19.5H4.5V15" />
                </svg>
              )}
            </span>
          </button>
        )}

        {collapsible && (
          <button
            type="button"
            className="panel-icon-btn panel-collapse-btn"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand panel' : 'Collapse panel'}
            aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          >
            <span className={`panel-collapse-icon${collapsed ? ' is-collapsed' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
        )}
      </div>
      {collapsed && <p className="panel-collapsed-note">{collapsedTitle}</p>}
      {children}
    </section>
  )
}
