import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getStoredDemoRole, setStoredDemoRole } from '../api/client'
import { CurrentUser, UserRole } from '../types'

type AuthContextType = {
  user?: CurrentUser
  loading: boolean
  isAuthenticated: boolean
  loginUser: (role: UserRole) => Promise<void>
  logoutUser: () => void
  selectRole: (role: UserRole) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const DEMO_USERS: Record<UserRole, CurrentUser> = {
  administrator: {
    user_id: 'demo-administrator',
    username: 'administrator@sabic.local',
    full_name: 'Platform Administrator',
    role: 'administrator',
    employee_code: null,
    is_active: true
  },
  reviewer: {
    user_id: 'demo-reviewer',
    username: 'reviewer@sabic.local',
    full_name: 'Corporate Reviewer',
    role: 'reviewer',
    employee_code: null,
    is_active: true
  },
  employee: {
    user_id: 'demo-employee',
    username: 'employee@sabic.local',
    full_name: 'Employee User',
    role: 'employee',
    employee_code: 'EMP-1001',
    is_active: true
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser>(() => DEMO_USERS[getStoredDemoRole()])
  const [loading] = useState(false)

  useEffect(() => {
    setStoredDemoRole(user?.role || 'reviewer')
  }, [user?.role])

  function selectRole(role: UserRole) {
    setStoredDemoRole(role)
    setUser(DEMO_USERS[role])
  }

  async function loginUser(role: UserRole) {
    selectRole(role)
  }

  function logoutUser() {
    selectRole('reviewer')
    window.location.assign('/login')
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: true,
      loginUser,
      logoutUser,
      selectRole
    }),
    [user, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
