// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

const me = (user?: { id: string; username: string; displayName: string }) =>
  new Response(JSON.stringify(user ? { ok: true, user } : { ok: false }), { status: user ? 200 : 401 })
const alice = { id: 'u1', username: 'alice', displayName: 'Alice' }

/** Renders the provider with a probe of its state; modules are fresh per test because availability is module state. */
async function renderAuth() {
  const { AuthProvider, useAuth } = await import('../AuthContext')
  const { useServerAvailability } = await import('../../services/server-availability')
  let refresh: () => Promise<void> = async () => {}
  function Probe() {
    const { user, loading, refreshSession } = useAuth()
    refresh = refreshSession
    return <div data-testid="auth">{loading ? 'loading' : user?.username ?? 'anonymous'}|{useServerAvailability()}</div>
  }
  render(<AuthProvider><Probe /></AuthProvider>)
  return { refresh: () => refresh() }
}

describe('AuthProvider while the server is unavailable', () => {
  it('waits on an unreachable server instead of signing the player out, then restores the session when it answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let down = true
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/health')) return new Response(down ? '{"ok":false,"code":"server_unavailable"}' : '{"ok":true}', { status: down ? 503 : 200 })
      if (url.endsWith('/api/auth/me')) {
        if (down) throw new TypeError('Failed to fetch')
        return me(alice)
      }
      return new Response('{}')
    }))
    await renderAuth()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('anonymous|unavailable'))

    down = false
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('alice|up'))
  })

  it('keeps a signed-in player signed in when a later session check meets the unavailable server', async () => {
    let down = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/health')) return new Response('{}', { status: down ? 503 : 200 })
      if (url.endsWith('/api/auth/me')) return down ? new Response('{"ok":false,"code":"server_unavailable"}', { status: 503 }) : me(alice)
      return new Response('{}')
    }))
    const auth = await renderAuth()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('alice|unknown'))

    down = true
    await act(async () => { await auth.refresh() })
    expect(screen.getByTestId('auth').textContent).toBe('alice|unavailable')
  })

  it('still signs out on a reachable server that rejects the session', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/health')) return new Response('{"ok":true}')
      if (url.endsWith('/api/auth/me')) throw new TypeError('Failed to fetch')
      return new Response('{}')
    }))
    await renderAuth()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('anonymous|up'))
  })
})
