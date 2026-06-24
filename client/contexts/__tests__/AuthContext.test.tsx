// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../AuthContext'

afterEach(() => {
  cleanup()
  window.history.pushState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AuthProvider', () => {
  it('does not read or write the legacy localStorage auth token', async () => {
    const getItem = vi.spyOn(window.localStorage.__proto__, 'getItem')
    const setItem = vi.spyOn(window.localStorage.__proto__, 'setItem')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ ok: false }), { status: 401 })
      }
      return new Response(JSON.stringify({ ok: true }))
    }))

    render(<AuthProvider><div>child</div></AuthProvider>)

    await screen.findByText('child')
    expect(getItem).not.toHaveBeenCalledWith('open-agricola-token')
    expect(setItem).not.toHaveBeenCalledWith('open-agricola-token', expect.any(String))
  })

  it('refreshes the authenticated user from the session endpoint', async () => {
    const user = userEvent.setup()
    let meCalls = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me')) {
        meCalls += 1
        if (meCalls === 1) {
          return new Response(JSON.stringify({ ok: false }), { status: 401 })
        }
        return new Response(JSON.stringify({
          ok: true,
          user: { id: 'u1', username: 'newuser', displayName: 'New User' },
        }))
      }
      return new Response(JSON.stringify({ ok: true }))
    })
    vi.stubGlobal('fetch', fetchMock)

    function Probe() {
      const { user, loading, refreshSession } = useAuth()
      return (
        <div>
          <div>{loading ? 'loading' : user?.username ?? 'anonymous'}</div>
          <button type="button" onClick={() => { void refreshSession() }}>refresh</button>
        </div>
      )
    }

    render(<AuthProvider><Probe /></AuthProvider>)

    await screen.findByText('anonymous')
    await user.click(screen.getByRole('button', { name: 'refresh' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.getByText('newuser')).toBeInTheDocument()
  })

  it('preserves the current route as OAuth login returnTo', async () => {
    window.history.pushState(null, '', '/?page=game&room=abc#board')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ ok: false }), { status: 401 })
      }
      return new Response(JSON.stringify({ ok: true }))
    }))

    function Probe() {
      const { oauthStartUrl } = useAuth()
      return <a href={oauthStartUrl('github', 'login')}>github</a>
    }

    render(<AuthProvider><Probe /></AuthProvider>)

    const link = await screen.findByRole('link', { name: 'github' })
    const url = new URL(link.getAttribute('href')!, window.location.origin)
    expect(url.pathname).toBe('/api/auth/oauth/github/start')
    expect(url.searchParams.get('intent')).toBe('login')
    expect(url.searchParams.get('returnTo')).toBe('/?page=game&room=abc#board')
  })
})
