import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { API_BASE } from '../config'
import { isDevModeAllowedFromQuery } from '../app/game-container-helpers'

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

const devAuthShortcutsEnabled = (): boolean =>
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_AUTH_SHORTCUTS === '1'

function devShortcutUserFromLocation(): AuthUser | null {
  const params = new URLSearchParams(window.location.search)
  const devPlayer = params.get('player')
  if (!devAuthShortcutsEnabled() || !devPlayer || !isDevModeAllowedFromQuery(window.location.search)) return null
  const displayName = devPlayer === 'p1' ? 'Player 1' : devPlayer === 'p2' ? 'Player 2' : devPlayer
  return { id: devPlayer, username: devPlayer, displayName }
}

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

function stripBasePath(pathname: string): string {
  const basePath = new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/$/, '')
  if (!basePath) return pathname
  if (pathname === basePath) return '/'
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || '/'
  return pathname
}

function currentReturnTo(): string | undefined {
  const current = `${stripBasePath(window.location.pathname)}${window.location.search}${window.location.hash}`
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')
  if (page === 'login' || page === 'onboarding') return undefined
  return current.startsWith('/') ? current : undefined
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
    const devUser = devShortcutUserFromLocation()
    if (devUser) {
      setState({ user: devUser, loading: false })
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
      const devUser = devShortcutUserFromLocation()
      setState({ user: devUser, loading: false })
    }
    return resp
  }, [])

  const oauthStartUrl = useCallback((
    provider: 'github' | 'google',
    intent: 'login' | 'register' | 'link',
  ) => {
    const params = new URLSearchParams({ intent })
    const returnTo = currentReturnTo()
    if (returnTo) params.set('returnTo', returnTo)
    return `${API_BASE}/api/auth/oauth/${provider}/start?${params.toString()}`
  }, [])

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
