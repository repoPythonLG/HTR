import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { UserRole } from '../types'

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: UserRole[] }) {
  const { loading, user } = useAuth()

  if (loading) {
    return <div className="screen-center">Loading session...</div>
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <div className="screen-center">Select an eligible workspace role from the role selector to view this area.</div>
  }

  return <Outlet />
}
