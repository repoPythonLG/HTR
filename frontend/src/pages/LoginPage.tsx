import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SabicIcon } from '../components/BrandIcons'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { loginUser } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('reviewer@sabic.local')
  const [password, setPassword] = useState('Reviewer#2026')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(undefined)
    try {
      await loginUser(username, password)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Login failed. Please check username and password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand">
          <SabicIcon size={172} className="sabic-wordmark" />
          <div>
            <p className="eyebrow">Enterprise Access</p>
            <h1>SABIC ClaimGuard</h1>
            <p className="login-copy">
              Corporate reimbursement audit software for finance, HR operations, and compliance investigation teams.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error && <div className="error-box">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="credentials-panel">
          <p>Demo users for this environment:</p>
          <ul>
            <li>Administrator: administrator@sabic.local / Admin#2026</li>
            <li>Reviewer: reviewer@sabic.local / Reviewer#2026</li>
            <li>Employee: employee@sabic.local / Employee#2026</li>
          </ul>
        </div>
      </section>
    </main>
  )
}
