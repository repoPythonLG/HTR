import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SabicIcon } from '../components/BrandIcons'
import { useAuth } from '../context/AuthContext'
import { UserRole } from '../types'

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; description: string }> = [
  {
    value: 'reviewer',
    label: 'Corporate Reviewer',
    description: 'Entry workbench, investigations, outlier analytics, and processed history.'
  },
  {
    value: 'administrator',
    label: 'Platform Administrator',
    description: 'Full reviewer access plus model governance and configuration screens.'
  },
  {
    value: 'employee',
    label: 'Employee View',
    description: 'Personal travel expense entry visibility and employee-facing dashboard.'
  }
]

export function LoginPage() {
  const { loginUser, user } = useAuth()
  const navigate = useNavigate()

  const [role, setRole] = useState<UserRole>(user?.role || 'reviewer')
  const selectedRole = ROLE_OPTIONS.find((option) => option.value === role) || ROLE_OPTIONS[0]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await loginUser(role)
    navigate(role === 'employee' ? '/employee' : '/receipts', { replace: true })
  }

  return (
    <main className="login-screen">
      <section className="login-card login-card-open-access">
        <div className="login-brand">
          <SabicIcon size={172} className="sabic-wordmark" />
          <div>
            <p className="eyebrow">Open Demo Access</p>
            <h1>SABIC Travel Expenses Guard</h1>
            <p className="login-copy">
              Select a workspace role and enter directly. No credentials or sign-in gate are required for this environment.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Workspace Role
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="role-preview-card">
            <span className="role-pill">{selectedRole.value}</span>
            <strong>{selectedRole.label}</strong>
            <p>{selectedRole.description}</p>
          </div>

          <button type="submit">Enter Application</button>
        </form>

        <div className="credentials-panel">
          <p>This is an open-access corporate demo mode.</p>
          <ul>
            <li>Open access is controlled only by the selected workspace role.</li>
            <li>The dropdown controls which application views are visible.</li>
            <li>You can switch roles any time from this screen.</li>
          </ul>
        </div>
      </section>
    </main>
  )
}
