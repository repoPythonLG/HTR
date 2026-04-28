import { Link } from 'react-router-dom'
import { ReactNode } from 'react'
import { AdminIcon, AnalyzeIcon, DocumentIcon, OutlierIcon, PolicyIcon, UsersIcon } from '../components/BrandIcons'
import { CollapsiblePanel } from '../components/CollapsiblePanel'
import { useAuth } from '../context/AuthContext'

type AdvancedSection = {
  title: string
  description: string
  to: string
  icon: ReactNode
  eyebrow: string
}

export function AdvancedSectionsPage() {
  const { user } = useAuth()

  const sections: AdvancedSection[] = [
    {
      title: 'Employee Risk Insights',
      description: 'HR-facing employee risk intelligence, spend concentration, violation frequency, and behaviour trend views.',
      to: '/employee-insights',
      icon: <UsersIcon size={22} />,
      eyebrow: 'People Intelligence'
    },
    {
      title: 'Outlier Analytics',
      description: '2D cluster and anomaly exploration for unusual destination-adjusted travel expense entry patterns.',
      to: '/outliers',
      icon: <OutlierIcon size={22} />,
      eyebrow: 'Statistical Review'
    },
    {
      title: 'Processed History',
      description: 'Audited, approved, rejected, and escalated travel expense entries that are no longer in the active queue.',
      to: '/history',
      icon: <DocumentIcon size={22} />,
      eyebrow: 'Audit Archive'
    },
    {
      title: 'Model Governance',
      description: 'Detection methods, thresholds, version history, policy controls, and explainability evidence.',
      to: '/governance',
      icon: <PolicyIcon size={22} />,
      eyebrow: 'Governance'
    }
  ]

  if (user?.role === 'administrator') {
    sections.push({
      title: 'Administrator Console',
      description: 'System configuration, risk settings, threshold controls, and platform administration.',
      to: '/admin',
      icon: <AdminIcon size={22} />,
      eyebrow: 'Administration'
    })
  }

  return (
    <div className="app-page advanced-sections-page">
      <CollapsiblePanel className="panel hero-panel advanced-hero" title="Advanced Sections Overview">
        <div>
          <p className="eyebrow">Advanced Control Center</p>
          <h2>Specialist analytics and governance tools</h2>
        </div>
        <div className="advanced-hero-badge">
          <AnalyzeIcon size={20} />
          <span>Advanced tools</span>
          <strong>{sections.length}</strong>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel className="panel app-grow" title="Available Advanced Sections" allowFocusView>
        <div className="advanced-section-grid">
          {sections.map((section) => (
            <Link key={section.to} className="advanced-section-card" to={section.to}>
              <span className="advanced-card-icon">{section.icon}</span>
              <span className="eyebrow">{section.eyebrow}</span>
              <strong>{section.title}</strong>
              <p>{section.description}</p>
              <span className="advanced-card-action">Open section</span>
            </Link>
          ))}
        </div>
      </CollapsiblePanel>
    </div>
  )
}
