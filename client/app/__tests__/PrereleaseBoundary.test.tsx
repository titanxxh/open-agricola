// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import { StrictMode, useEffect } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const build = 'a'.repeat(40), generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
vi.mock('../../contexts/LocaleContext', () => ({ useLocale: () => ({ t: (key: string, values?: { version?: string }) => values?.version ? `Prerelease ${values.version}` : key }) }))
afterEach(() => { cleanup(); vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); window.history.replaceState(null, '', '/open-agricola/') })
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
    return Response.json({ ok: true, returnPath: '/open-agricola/?context=kept-room&step=4&frame=' + 'f'.repeat(64), user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true }, prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000, validUntil: Date.now() + 30_000, serverTime: Date.now() } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  render(<StrictMode><PrereleaseBoundary><div>Private game context</div></PrereleaseBoundary></StrictMode>)
  expect(await screen.findByText('Private game context')).toBeVisible()
  expect(screen.getByText('Prerelease aaaaaaaaaaaa')).toBeVisible()
  expect(screen.getByRole('link', { name: 'prerelease.returnToProduction' })).toHaveAttribute('href', 'https://formal.agricola.test/')
  expect(window.location.pathname + window.location.search).toBe('/open-agricola/?context=kept-room&step=4&frame=' + 'f'.repeat(64))
  expect(fetchMock).toHaveBeenCalledTimes(2)
})


it('does not follow an external target returned by a malformed callback response', async () => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  window.history.replaceState(null, '', '/open-agricola/auth/handoff#' + new URLSearchParams({ protocolVersion: '1', code: 'c'.repeat(43), state: 's'.repeat(43), browserChallenge: 'b'.repeat(43), returnTo: 'https://formal.agricola.test/' }))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/runtime')
    ? Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation, appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    : Response.json({ ok: true, returnPath: 'https://evil.test/steal' })))
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  render(<PrereleaseBoundary><div>Private game context</div></PrereleaseBoundary>)
  expect(await screen.findByText('prerelease.handoffInvalid')).toBeVisible()
  expect(screen.queryByText('Private game context')).toBeNull()
  expect(window.location.origin).toBe('https://pre.agricola.test')
})

it('keeps private pages mounted when a healthy session returns less than one polling interval of authorization', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  vi.setSystemTime(1_000_000)
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  let confirmations = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/runtime')) return Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    const remaining = ++confirmations === 2 ? 9_000 : 30_000
    return Response.json({ ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
      prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000, validUntil: Date.now() + remaining, serverTime: Date.now() } })
  }))
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  let unmounted = 0
  function PrivatePage() {
    useEffect(() => () => { unmounted++ }, [])
    return <div>Private game context</div>
  }
  await act(async () => { render(<StrictMode><PrereleaseBoundary><PrivatePage /></PrereleaseBoundary></StrictMode>) })
  expect(screen.getByText('Private game context')).toBeVisible()
  const initialUnmounts = unmounted
  await act(async () => { await vi.advanceTimersByTimeAsync(29_000) })
  expect(screen.getByText('Private game context')).toBeVisible()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(unmounted).toBe(initialUnmounts)
})

it('expires an in-flight confirmation at the original deadline without parallel checks or late revival', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  vi.setSystemTime(1_000_000)
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  let confirmations = 0
  let complete: (response: Response) => void = () => { throw new Error('No confirmation is in flight') }
  const confirmed = () => Response.json({ ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
    prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000, validUntil: Date.now() + 30_000, serverTime: Date.now() } })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/runtime')) return Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    if (++confirmations === 1) return confirmed()
    return new Promise<Response>(resolve => { complete = resolve })
  }))
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  await act(async () => { render(<PrereleaseBoundary><div>Private game context</div></PrereleaseBoundary>) })
  await act(async () => { await vi.advanceTimersByTimeAsync(29_999) })
  expect(screen.getByText('Private game context')).toBeVisible()
  expect(confirmations).toBe(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(screen.queryByText('Private game context')).toBeNull()
  expect(screen.getByRole('alert')).toHaveTextContent('prerelease.accessPaused')
  expect(confirmations).toBe(2)
  await act(async () => { complete(confirmed()) })
  expect(screen.queryByText('Private game context')).toBeNull()
  expect(screen.getByRole('alert')).toHaveTextContent('prerelease.accessPaused')
})

it('pauses private pages when a confirmation fails instead of granting a fresh polling interval', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  vi.setSystemTime(1_000_000)
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  let confirmations = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/runtime')) return Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    if (++confirmations > 1) throw new Error('Authority unavailable')
    return Response.json({ ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
      prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000, validUntil: Date.now() + 30_000, serverTime: Date.now() } })
  }))
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  await act(async () => { render(<PrereleaseBoundary><div>Private game context</div></PrereleaseBoundary>) })
  expect(screen.getByText('Private game context')).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(screen.queryByText('Private game context')).toBeNull()
  expect(screen.getByRole('alert')).toHaveTextContent('prerelease.accessPaused')
})
