import dayjs from 'dayjs'
import { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { AdminIcon, ClaimsIcon, DashboardIcon, DocumentIcon, EmployeeIcon, OutlierIcon, PolicyIcon, SabicIcon, UploadIcon, UsersIcon } from '../components/BrandIcons'
import { useAuth } from '../context/AuthContext'

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      <span className="nav-item-row">
        <span className="nav-icon">{icon}</span>
        <span>{label}</span>
      </span>
    </NavLink>
  )
}

export function AppLayout() {
  const { user, logoutUser } = useAuth()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand brand-row">
          <div className="brand-logo-strip">
            <SabicIcon size={98} className="sabic-wordmark" />
          </div>
          <div>
            <p>SABIC Enterprise</p>
            <h2>ClaimGuard Platform</h2>
            <span className="brand-subtitle">AI Receipt-to-Claim Governance</span>
          </div>
        </div>

        <div className="sidebar-meta">
          <span>Secure Session</span>
          <strong>{dayjs().format('DD MMM YYYY')}</strong>
        </div>

        <nav className="nav-grid">
          <NavItem to="/dashboard" label="Executive Dashboard" icon={<DashboardIcon />} />
          <NavItem to="/claims" label="Claims Workbench" icon={<ClaimsIcon />} />
          <NavItem to="/intake" label="Data Intake" icon={<UploadIcon />} />
          {(user?.role === 'reviewer' || user?.role === 'administrator') && (
            <NavItem to="/employee-insights" label="Employee Risk Insights" icon={<UsersIcon />} />
          )}
          {(user?.role === 'reviewer' || user?.role === 'administrator') && (
            <NavItem to="/outliers" label="Outlier Analytics" icon={<OutlierIcon />} />
          )}
          {(user?.role === 'reviewer' || user?.role === 'administrator') && (
            <NavItem to="/history" label="Processed History" icon={<DocumentIcon />} />
          )}
          {(user?.role === 'reviewer' || user?.role === 'administrator') && (
            <NavItem to="/governance" label="Model Governance" icon={<PolicyIcon />} />
          )}
          {user?.role === 'employee' && (
            <NavItem to="/employee" label="Employee View" icon={<EmployeeIcon />} />
          )}
          {user?.role === 'administrator' && (
            <NavItem to="/admin" label="Administrator Console" icon={<AdminIcon />} />
          )}
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar compact-topbar">
          <div className="topbar-session">
            <span>Signed in as</span>
            <strong>{user?.full_name}</strong>
            <span>{user?.username}</span>
            <span className="role-pill">{user?.role}</span>
          </div>
          <button onClick={logoutUser}>Sign out</button>
        </header>

        <section className="content-area">
          <Outlet />
        </section>
      </div>
    </div>
  )
}
