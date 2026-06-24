import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { API_BASE } from '../config'

export type AuthUser = {
  id: string
  username: string
  displayName: string
  isAdmin?: boolean
}

type AuthState = {
  user: AuthUser | null
  loading: boolean
}

type AuthContextValue = AuthState & {
  login: (username: string, password: string) => Promise<{ ok: boolean; code?: string; error?: string }>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  refreshSession: () => Promise<void>
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  oauthStartUrl: (provider: 'github' | 'google', intent: 'login' | 'register' | 'link') => string
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function authFetch(path: string, body: Record<string, unknown>, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return await resp.json()
    } catch (err) {
      if (attempt >= retries) throw err
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  const refreshSessionFn = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: 'include',
      })
      const data = await resp.json()
      if (data.ok && data.user) {
        setState({ user: data.user, loading: false })
      } else {
        setState({ user: null, loading: false })
      }
    } catch {
      setState({ user: null, loading: false })
    }
  }, [])

  // Check existing session on mount
  useEffect(() => {
    // Dev shortcut: ?player=p1 skips auth entirely (for restart-intranet.sh dev links)
    const params = new URLSearchParams(window.location.search)
    const devPlayer = params.get('player')
    if (devPlayer && (params.get('transport') === 'ws' || params.get('devMode'))) {
      const displayName = devPlayer === 'p1' ? 'Player 1' : devPlayer === 'p2' ? 'Player 2' : devPlayer
      setState({ user: { id: devPlayer, username: devPlayer, displayName }, loading: false })
      return
    }

    void refreshSessionFn()
  }, [refreshSessionFn])

  const loginFn = useCallback(async (username: string, password: string) => {
    const data = await authFetch('/api/auth/login', { username, password })
    if (data.ok) {
      setState({ user: data.user, loading: false })
      return { ok: true }
    }
    return { ok: false, code: data.code, error: data.error || 'Login failed' }
  }, [])

  const logoutFn = useCallback(async () => {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    setState({ user: null, loading: false })
  }, [])

  const logoutAllFn = useCallback(async () => {
    await fetch(`${API_BASE}/api/auth/logout-all`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    setState({ user: null, loading: false })
  }, [])

  const apiFetchFn = useCallback(async (path: string, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> ?? {}),
    }
    const resp = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers })
    if (resp.status === 401) {
      setState({ user: null, loading: false })
    }
    return resp
  }, [])

  const oauthStartUrl = useCallback((
    provider: 'github' | 'google',
    intent: 'login' | 'register' | 'link',
  ) => `${API_BASE}/api/auth/oauth/${provider}/start?intent=${intent}`, [])

  return (
    <AuthContext.Provider value={{
      ...state,
      login: loginFn,
      logout: logoutFn,
      logoutAll: logoutAllFn,
      refreshSession: refreshSessionFn,
      apiFetch: apiFetchFn,
      oauthStartUrl,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
