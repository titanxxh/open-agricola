// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import { StrictMode, useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

it.each([9_000, 200])('keeps private pages continuously mounted with %ims left in a healthy cached confirmation', async cachedRemaining => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  vi.setSystemTime(1_000_000)
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  let confirmations = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/runtime')) return Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    const remaining = ++confirmations === 2 ? cachedRemaining : 30_000
    if (confirmations > 2) await new Promise<void>(resolve => setTimeout(resolve, 50))
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
  expect(confirmations).toBe(3)
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

it('keeps a known denial terminal when an older confirmation later pauses', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  vi.setSystemTime(1_000_000)
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  const confirmation = Promise.withResolvers<Response>()
  let confirmations = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/runtime')) return Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    if (url === '/api/v1/game-contexts/kept-room') return Response.json({ ok: false, code: 'prerelease_access_expired' }, { status: 403 })
    if (++confirmations > 1) return confirmation.promise
    return Response.json({ ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
      prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000,
        validUntil: Date.now() + 30_000, serverTime: Date.now() } })
  }))
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  const { browserApiFetch } = await import('../../services/browser-api')
  await act(async () => { render(<PrereleaseBoundary><div>Private game context</div></PrereleaseBoundary>) })
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(confirmations).toBe(2)
  await act(async () => {
    await expect(browserApiFetch('/api/v1/game-contexts/kept-room')).rejects.toThrow('prerelease_access_expired')
  })
  expect(screen.queryByText('Private game context')).toBeNull()
  await act(async () => { confirmation.resolve(Response.json({ ok: false, code: 'prerelease_access_paused' }, { status: 503 })) })
  expect(screen.getByRole('alert')).toHaveTextContent('prerelease.accessExpired')
  expect(screen.queryByRole('button', { name: 'platform.retry' })).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(confirmations).toBe(2)
  expect(screen.queryByText('Private game context')).toBeNull()
})


it.each(['unavailable', 'lost-body'])('retries the bound callback safely after an %s exchange without using an ambient account', async failure => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  const callback = { protocolVersion: '1', code: 'c'.repeat(43), state: 's'.repeat(43), browserChallenge: 'b'.repeat(43), returnTo: 'https://formal.agricola.test/' }
  window.history.replaceState(null, '', '/open-agricola/auth/handoff#' + new URLSearchParams(callback))
  let exchanges = 0
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect(window.location.hash).toBe('')
    if (url.endsWith('/runtime')) return Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    expect(url).toBe('/api/prerelease/session')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ ...callback, protocolVersion: 1 })
    if (++exchanges === 1) return failure === 'unavailable'
      ? Response.json({ ok: false, code: 'prerelease_access_paused' }, { status: 503 })
      : new Response('{"ok":true', { status: 200 })
    return Response.json({ ok: true, returnPath: '/open-agricola/?room=kept-room',
      user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
      prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000,
        validUntil: Date.now() + 30_000, serverTime: Date.now() } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  const runtime = await import('../../services/prerelease-runtime')
  render(<StrictMode><PrereleaseBoundary><div>Private game context</div></PrereleaseBoundary></StrictMode>)
  expect(await screen.findByText('prerelease.accessPaused')).toBeVisible()
  expect(screen.queryByText('Private game context')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'platform.retry' }))
  expect(await screen.findByText('Private game context')).toBeVisible()
  expect(exchanges).toBe(2)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(runtime.getPrereleaseAccess()).toMatchObject({ kind: 'active', session: { user: { id: 'u1' } } })
  expect(window.location.pathname + window.location.search).toBe('/open-agricola/?room=kept-room')
})

it.each([{ status: 400, code: 'invalid_prerelease_handoff' }, { status: 403, code: 'prerelease_access_expired' }])('requires a fresh entry after terminal handoff $status', async ({ status, code }) => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  window.history.replaceState(null, '', '/open-agricola/auth/handoff#' + new URLSearchParams({ protocolVersion: '1', code: 'c'.repeat(43), state: 's'.repeat(43), browserChallenge: 'b'.repeat(43), returnTo: 'https://formal.agricola.test/' }))
  const fetchMock = vi.fn(async (url: string) => url.endsWith('/runtime')
    ? Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    : Response.json({ ok: false, code }, { status }))
  vi.stubGlobal('fetch', fetchMock)
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  await act(async () => { render(<PrereleaseBoundary><div>Private game context</div></PrereleaseBoundary>) })
  expect(screen.queryByText('Private game context')).toBeNull()
  expect(screen.queryByRole('button', { name: 'platform.retry' })).toBeNull()
  expect(screen.getByRole('link', { name: 'prerelease.entry' })).toHaveAttribute('href', expect.stringContaining('/open-agricola/auth/start?returnPath='))
  await act(async () => { await vi.advanceTimersByTimeAsync(16_000) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
