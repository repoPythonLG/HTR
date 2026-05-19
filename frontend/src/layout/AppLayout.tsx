import dayjs from 'dayjs'
import { ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AdminIcon, ReceiptsIcon, DashboardIcon, EmployeeIcon, SabicIcon, UploadIcon } from '../components/BrandIcons'
import { useAuth } from '../context/AuthContext'
import { UserRole } from '../types'

function NavItem({ to, label, icon, activePaths = [] }: { to: string; label: string; icon: ReactNode; activePaths?: string[] }) {
  const location = useLocation()
  const hasNestedActivePath = activePaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))

  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item ${isActive || hasNestedActivePath ? 'active' : ''}`}
    >
      <span className="nav-item-row">
        <span className="nav-icon">{icon}</span>
        <span>{label}</span>
      </span>
    </NavLink>
  )
}

export function AppLayout() {
  const { user, selectRole } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const canSeeAdvanced = user?.role === 'reviewer' || user?.role === 'administrator'
  const canSeeReviewWorkspace = user?.role === 'reviewer' || user?.role === 'administrator'

  function handleRoleChange(role: UserRole) {
    selectRole(role)
    if (role === 'employee') {
      navigate('/employee', { replace: true })
      return
    }
    if (location.pathname.startsWith('/employee')) {
      navigate('/receipts', { replace: true })
      return
    }
    if (role !== 'administrator' && location.pathname.startsWith('/admin')) {
      navigate('/advanced', { replace: true })
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand brand-row">
          <div className="brand-logo-strip">
            <SabicIcon size={98} className="sabic-wordmark" />
          </div>
          <div>
            <p>SABIC Enterprise</p>
            <h2>Travel Expenses Guard Platform</h2>
            <span className="brand-subtitle">AI Travel Expense Governance</span>
          </div>
        </div>

        <div className="sidebar-meta">
          <span>Secure Session</span>
          <strong>{dayjs().format('DD MMM YYYY')}</strong>
        </div>

        <div className="nav-section-label">Application Pages</div>

        <nav className="nav-grid">
          {user?.role === 'employee' && (
            <NavItem to="/employee" label="Employee View" icon={<EmployeeIcon />} />
          )}
          {canSeeReviewWorkspace && (
            <>
              <NavItem to="/receipts" label="Travel Expense Entry Workbench" icon={<ReceiptsIcon />} />
              <NavItem to="/dashboard" label="Executive Dashboard" icon={<DashboardIcon />} />
              <NavItem to="/intake" label="Data Intake" icon={<UploadIcon />} />
            </>
          )}
          {canSeeAdvanced && (
            <NavItem
              to="/advanced"
              label="Advanced Sections"
              icon={<AdminIcon />}
              activePaths={['/advanced', '/employee-insights', '/outliers', '/history', '/governance', '/admin']}
            />
          )}
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar compact-topbar">
          <div className="topbar-session">
            <span>Workspace role</span>
            <strong>{user?.full_name}</strong>
            <span>{user?.username}</span>
            <span className="role-pill">{user?.role}</span>
          </div>
          <label className="role-switcher">
            <span>Change role</span>
            <select value={user?.role || 'reviewer'} onChange={(event) => handleRoleChange(event.target.value as UserRole)}>
              <option value="reviewer">Corporate Reviewer</option>
              <option value="administrator">Platform Administrator</option>
              <option value="employee">Employee View</option>
            </select>
          </label>
        </header>

        <section className="content-area">
          <Outlet />
        </section>
      </div>
    </div>
  )
}
