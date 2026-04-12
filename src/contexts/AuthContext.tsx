import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { API_BASE } from '../config'

const TOKEN_KEY = 'open-agricola-token'

export type AuthUser = {
  id: string
  username: string
  displayName: string
  isAdmin?: boolean
}

type AuthState = {
  user: AuthUser | null
  token: string | null
  loading: boolean
}

type AuthContextValue = AuthState & {
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  register: (username: string, password: string, displayName?: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  /** Authenticated fetch: adds Bearer token, auto-logouts on 401. */
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function authFetch(path: string, body: Record<string, unknown>, token?: string | null, retries = 2) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
      return await resp.json()
    } catch (err) {
      if (attempt >= retries) throw err
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true })

  // Check existing session on mount
  useEffect(() => {
    // Dev shortcut: ?player=p1 skips auth entirely (for restart-intranet.sh dev links)
    const params = new URLSearchParams(window.location.search)
    const devPlayer = params.get('player')
    if (devPlayer && (params.get('transport') === 'ws' || params.get('devMode'))) {
      const displayName = devPlayer === 'p1' ? 'Player 1' : devPlayer === 'p2' ? 'Player 2' : devPlayer
      setState({ user: { id: devPlayer, username: devPlayer, displayName }, token: null, loading: false })
      return
    }

    const savedToken = localStorage.getItem(TOKEN_KEY)
    if (!savedToken) {
      setState({ user: null, token: null, loading: false })
      return
    }
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${savedToken}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.user) {
          setState({ user: data.user, token: savedToken, loading: false })
        } else {
          localStorage.removeItem(TOKEN_KEY)
          setState({ user: null, token: null, loading: false })
        }
      })
      .catch(() => {
        setState({ user: null, token: null, loading: false })
      })
  }, [])

  const loginFn = useCallback(async (username: string, password: string) => {
    const data = await authFetch('/api/auth/login', { username, password })
    if (data.ok) {
      localStorage.setItem(TOKEN_KEY, data.token)
      setState({ user: data.user, token: data.token, loading: false })
      return { ok: true }
    }
    return { ok: false, error: data.error || 'Login failed' }
  }, [])

  const registerFn = useCallback(async (username: string, password: string, displayName?: string) => {
    const data = await authFetch('/api/auth/register', { username, password, displayName })
    if (data.ok) {
      localStorage.setItem(TOKEN_KEY, data.token)
      setState({ user: data.user, token: data.token, loading: false })
      return { ok: true }
    }
    return { ok: false, error: data.error || 'Registration failed' }
  }, [])

  const logoutFn = useCallback(() => {
    const token = state.token
    if (token) {
      fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {})
    }
    localStorage.removeItem(TOKEN_KEY)
    setState({ user: null, token: null, loading: false })
  }, [state.token])

  const apiFetchFn = useCallback(async (path: string, init?: RequestInit): Promise<Response> => {
    const token = state.token
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> ?? {}),
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const resp = await fetch(`${API_BASE}${path}`, { ...init, headers })
    if (resp.status === 401) {
      // Session expired — auto-logout and let PageRouter redirect to login
      localStorage.removeItem(TOKEN_KEY)
      setState({ user: null, token: null, loading: false })
    }
    return resp
  }, [state.token])

  return (
    <AuthContext.Provider value={{ ...state, login: loginFn, register: registerFn, logout: logoutFn, apiFetch: apiFetchFn }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
