// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const build = 'a'.repeat(40), generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
vi.mock('../LocaleContext', () => ({ useLocale: () => ({ t: (key: string, values?: { version?: string }) => values?.version ? `Prerelease ${values.version}` : key }) }))
afterEach(() => {
  cleanup(); vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers()
  window.history.replaceState(null, '', '/open-agricola/')
})

const actions: Array<'logout' | 'logoutAll'> = ['logout', 'logoutAll']
it.each(actions)('ends prerelease admission immediately during %s without adopting a later cookie confirmation', async action => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  vi.setSystemTime(1_000_000)
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  const path = action === 'logout' ? '/api/auth/logout' : '/api/auth/logout-all'
  let finishLogout: (response: Response) => void = () => { throw new Error('Logout did not begin') }
  const requests: string[] = []
  const confirmed = () => Response.json({ ok: true,
    user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
    prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000,
      validUntil: Date.now() + 30_000, serverTime: Date.now() } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(url)
    if (url.endsWith('/runtime')) return Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    if (url.endsWith(path)) {
      expect(init?.credentials).toBe('include')
      return new Promise<Response>(resolve => { finishLogout = resolve })
    }
    expect(url).toBe('/api/auth/me')
    return confirmed()
  }))
  const runtime = await import('../../services/prerelease-runtime')
  const { PrereleaseBoundary } = await import('../../app/PrereleaseBoundary')
  const { AuthProvider, useAuth } = await import('../AuthContext')
  function Page() {
    const auth = useAuth()
    return <><p>{auth.user?.displayName ?? 'No user'}</p><button type="button" onClick={() => { void auth[action]() }}>Sign out</button></>
  }
  await act(async () => { render(<PrereleaseBoundary><AuthProvider><Page /></AuthProvider></PrereleaseBoundary>) })
  expect(screen.getByText('Beta')).toBeVisible()
  const stopped = vi.fn()
  const unsubscribe = runtime.subscribePrereleaseAccess(() => { if (runtime.getPrereleaseAccess().kind === 'ended') stopped() })
  try {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })) })
    expect(runtime.getPrereleaseAccess()).toEqual({ kind: 'ended', code: 'prerelease_auth_required' })
    expect(screen.queryByText('Beta')).toBeNull()
    expect(stopped).toHaveBeenCalledTimes(1)
    const requestsAtExit = requests.length
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000) })
    expect(requests).toHaveLength(requestsAtExit)
    expect(screen.queryByText('Beta')).toBeNull()
    expect(runtime.getPrereleaseAccess()).toEqual({ kind: 'ended', code: 'prerelease_auth_required' })
    expect(requests).toContain(path)
    expect(requests.every(url => url.startsWith('/api/'))).toBe(true)
  } finally {
    unsubscribe()
    await act(async () => { finishLogout(Response.json({ ok: true })) })
  }
})
