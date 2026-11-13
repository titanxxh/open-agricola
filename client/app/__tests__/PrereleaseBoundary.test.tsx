// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import { StrictMode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const build = 'a'.repeat(40), generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
vi.mock('../../contexts/LocaleContext', () => ({ useLocale: () => ({ t: (key: string, values?: { version?: string }) => values?.version ? `Prerelease ${values.version}` : key }) }))
afterEach(() => { cleanup(); vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/open-agricola/') })
it('keeps private Context and metadata children unmounted until the restricted session is admitted', async () => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/runtime')
    ? Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation, appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    : Response.json({ ok: false, code: 'prerelease_auth_required' }, { status: 401 })))
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  render(<StrictMode><PrereleaseBoundary><div>Private game context</div></PrereleaseBoundary></StrictMode>)
  expect(await screen.findByText('prerelease.accessExpired')).toBeVisible()
  expect(screen.queryByText('Private game context')).toBeNull()
  expect(screen.getByRole('link', { name: 'prerelease.returnToProduction' })).toHaveAttribute('href', 'https://formal.agricola.test/')
  expect(screen.queryByRole('textbox')).toBeNull()
})


it('clears the callback fragment before posting its bounded fields and then mounts private pages with the persistent environment banner', async () => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  const callback = { protocolVersion: '1', code: 'c'.repeat(43), state: 's'.repeat(43), browserChallenge: 'b'.repeat(43), returnTo: 'https://formal.agricola.test/' }
  window.history.replaceState(null, '', '/open-agricola/auth/handoff#' + new URLSearchParams(callback))
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect(window.location.hash).toBe('')
    if (url.endsWith('/runtime')) return Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation, appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    expect(url).toBe('/api/prerelease/session')
    expect(JSON.parse(String(init?.body))).toEqual({ ...callback, protocolVersion: 1 })
    expect(init?.credentials).toBe('include')
    return Response.json({ ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true }, prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000, validUntil: Date.now() + 30_000, serverTime: Date.now() } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  render(<StrictMode><PrereleaseBoundary><div>Private game context</div></PrereleaseBoundary></StrictMode>)
  expect(await screen.findByText('Private game context')).toBeVisible()
  expect(screen.getByText('Prerelease aaaaaaaaaaaa')).toBeVisible()
  expect(screen.getByRole('link', { name: 'prerelease.returnToProduction' })).toHaveAttribute('href', 'https://formal.agricola.test/')
  expect(window.location.pathname).toBe('/open-agricola/')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
