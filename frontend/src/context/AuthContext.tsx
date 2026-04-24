import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { fetchCurrentUser, getStoredToken, login, setStoredToken } from '../api/client'
import { CurrentUser } from '../types'

type AuthContextType = {
  user?: CurrentUser
  loading: boolean
  isAuthenticated: boolean
  loginUser: (username: string, password: string) => Promise<void>
  logoutUser: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setLoading(false)
      return
    }

    fetchCurrentUser()
      .then((profile) => setUser(profile))
      .catch(() => {
        setStoredToken(null)
        setUser(undefined)
      })
      .finally(() => setLoading(false))
  }, [])

  async function loginUser(username: string, password: string) {
    const token = await login(username, password)
    setStoredToken(token.access_token)
    const profile = await fetchCurrentUser()
    setUser(profile)
  }

  function logoutUser() {
    setStoredToken(null)
    setUser(undefined)
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      loginUser,
      logoutUser
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
