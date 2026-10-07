// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../AuthContext'
import { useEffect } from 'react'

afterEach(() => {
  cleanup()
  window.history.pushState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
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

  it('strips the deployment base path from OAuth login returnTo', async () => {
    vi.stubEnv('BASE_URL', '/open-agricola/')
    window.history.pushState(null, '', '/open-agricola/?page=workshop&view=sandbox')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ ok: false }), { status: 401 })
      }
      return new Response(JSON.stringify({ ok: true }))
    }))

    function Probe() {
      const { oauthStartUrl } = useAuth()
      return <a href={oauthStartUrl('google', 'login')}>google</a>
    }

    render(<AuthProvider><Probe /></AuthProvider>)

    const link = await screen.findByRole('link', { name: 'google' })
    const url = new URL(link.getAttribute('href')!, window.location.origin)
    expect(url.searchParams.get('returnTo')).toBe('/?page=workshop&view=sandbox')
  })

  it('preserves the current route as OAuth register returnTo', async () => {
    window.history.pushState(null, '', '/?page=workshop&view=sandbox')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ ok: false }), { status: 401 })
      }
      return new Response(JSON.stringify({ ok: true }))
    }))

    function Probe() {
      const { oauthStartUrl } = useAuth()
      return <a href={oauthStartUrl('github', 'register')}>github</a>
    }

    render(<AuthProvider><Probe /></AuthProvider>)

    const link = await screen.findByRole('link', { name: 'github' })
    const url = new URL(link.getAttribute('href')!, window.location.origin)
    expect(url.searchParams.get('intent')).toBe('register')
    expect(url.searchParams.get('returnTo')).toBe('/?page=workshop&view=sandbox')
  })

  it('does not add OAuth returnTo on login or onboarding pages', async () => {
    window.history.pushState(null, '', '/?page=login')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ ok: false }), { status: 401 })
      }
      return new Response(JSON.stringify({ ok: true }))
    }))

    function Probe() {
      const { oauthStartUrl } = useAuth()
      return <a href={oauthStartUrl('github', 'register')}>github</a>
    }

    render(<AuthProvider><Probe /></AuthProvider>)

    const link = await screen.findByRole('link', { name: 'github' })
    const url = new URL(link.getAttribute('href')!, window.location.origin)
    expect(url.searchParams.has('returnTo')).toBe(false)
  })

  it('preserves a replay anchor when OAuth starts from its login page', async () => {
    window.history.pushState(
      null,
      '',
      '/?page=login&context=completed-room&step=4&frame=hash&bugReport=draft-1',
    )
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
    expect(url.searchParams.get('returnTo')).toBe(
      '/?context=completed-room&step=4&frame=hash&bugReport=draft-1',
    )
  })

  it('keeps documented non-game dev shortcuts authenticated', async () => {
    window.history.pushState(null, '', '/?page=workshop&player=p1&devMode=1')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    function Probe() {
      const { user, loading } = useAuth()
      return <div>{loading ? 'loading' : user?.username ?? 'anonymous'}<span>{user?.displayNameIsDefault ? 'generated name' : 'account name'}</span></div>
    }

    render(<AuthProvider><Probe /></AuthProvider>)

    expect(await screen.findByText('p1')).toBeInTheDocument()
    expect(screen.getByText('generated name')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not clear documented dev shortcut users on cookie API 401s', async () => {
    window.history.pushState(null, '', '/?page=workshop&player=p1&devMode=1')
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: false }), { status: 401 }),
    ))

    function Probe() {
      const { user, loading, apiFetch } = useAuth()
      return (
        <div>
          <div>{loading ? 'loading' : user?.username ?? 'anonymous'}</div>
          <button type="button" onClick={() => { void apiFetch('/api/workshop/cards') }}>load</button>
        </div>
      )
    }

    const clicker = userEvent.setup()
    render(<AuthProvider><Probe /></AuthProvider>)

    expect(await screen.findByText('p1')).toBeInTheDocument()
    await clicker.click(screen.getByRole('button', { name: 'load' }))
    await waitFor(() => expect(screen.getByText('p1')).toBeInTheDocument())
  })

  it('does not repeatedly fetch dev lobby data after an unauthenticated cookie response', async () => {
    window.history.pushState(null, '', '/?player=p1&devMode=1')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    function Probe() {
      const { user, apiFetch } = useAuth()
      useEffect(() => {
        // Bound a possible loop so a regression fails without hanging the test.
        if (user && fetchMock.mock.calls.length < 3) void apiFetch('/api/rooms/my')
      }, [user, apiFetch])
      return <div>{user?.username ?? 'anonymous'}</div>
    }
    render(<AuthProvider><Probe /></AuthProvider>)
    await screen.findByText('p1')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
