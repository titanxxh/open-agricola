// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const build = 'a'.repeat(40)
const generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/open-agricola/')
  window.localStorage.clear()
})

async function renderPrerelease({ handoff, status, code, runtimeFailure = false }: {
  handoff: boolean
  status: number
  code: string
  runtimeFailure?: boolean
}) {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease')
  vi.stubEnv('VITE_GAME_BUILD_ID', build)
  if (handoff) {
    window.history.replaceState(null, '', '/open-agricola/auth/handoff#' + new URLSearchParams({
      protocolVersion: '1', code: 'c'.repeat(43), state: 's'.repeat(43),
      browserChallenge: 'b'.repeat(43), returnTo: 'https://formal.agricola.test/',
    }))
  }
  const { registerLanguagePack } = await import('../../shared/i18n')
  registerLanguagePack({ version: 1, locale: 'zh', messages: {
    'platform.appLoadFailed': 'Reload the application',
    'platform.retry': 'Retry',
    'prerelease.accessPaused': 'Access is paused',
    'prerelease.environment': 'Prerelease environment',
    'prerelease.version': 'Prerelease {version}',
    'prerelease.returnToProduction': 'Return to production',
    'prerelease.entry': 'Prerelease entry',
  } })
  const endpoint = handoff ? '/api/prerelease/session' : '/api/auth/me'
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const path = new URL(url, window.location.origin).pathname
    if (path === '/api/prerelease/runtime') {
      expect(init?.credentials).toBe('include')
      expect(init?.cache).toBe('no-store')
      expect(new Headers(init?.headers).get('x-oa-browser-protocol')).toBe('2')
      expect(new Headers(init?.headers).get('x-oa-pre-build')).toBeNull()
      expect(new Headers(init?.headers).get('x-oa-pre-generation')).toBeNull()
      return runtimeFailure ? Response.json({ ok: false, code }, { status }) : Response.json({
        ok: true, channel: 'prerelease', buildId: build, generationId: generation,
        appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test',
        formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main',
      })
    }
    expect(path).toBe(endpoint)
    expect(init?.method ?? 'GET').toBe(handoff ? 'POST' : 'GET')
    expect(window.location.hash).toBe('')
    return Response.json({ ok: false, code }, { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  const contexts = await import('../app/GameContextRouter')
  const auth = await import('../contexts/AuthContext')
  const pages = await import('../app/PageRouter')
  const privateRenders = [
    vi.spyOn(contexts, 'GameContextRouter'),
    vi.spyOn(auth, 'AuthProvider'),
    vi.spyOn(pages, 'PageRouter'),
  ]
  const { default: App } = await import('../App')
  const api = await import('../services/browser-api')
  render(<StrictMode><App /></StrictMode>)
  return { api, fetchMock, privateRenders }
}

function expectPrereleaseBanner(runtimeKnown = true) {
  const banner = screen.getByRole('complementary', { name: 'Prerelease environment' })
  expect(within(banner).getByText('Prerelease aaaaaaaaaaaa')).toBeVisible()
  if (runtimeKnown) expect(within(banner).getByRole('link', { name: 'Return to production' })).toHaveAttribute('href', 'https://formal.agricola.test/')
  else expect(within(banner).getByRole('link', { name: 'Prerelease entry' })).toHaveAttribute('href', '/open-agricola/auth/start?returnPath=%2Fopen-agricola%2F')
}

it.each([
  { route: 'runtime session bootstrap', handoff: false, runtimeFailure: true },
  { route: 'runtime handoff bootstrap', handoff: true, runtimeFailure: true },
  { route: 'session check', handoff: false, runtimeFailure: false },
  { route: 'handoff exchange', handoff: true, runtimeFailure: false },
])('shows global recovery for reload_required from the $route without mounting private pages', async ({ handoff, runtimeFailure }) => {
  const { api, fetchMock, privateRenders } = await renderPrerelease({ handoff, runtimeFailure, status: 426, code: 'reload_required' })

  await waitFor(() => expect(api.getBrowserReloadRequired()).toBe(true))

  expect(await screen.findByRole('alert')).toHaveTextContent('Reload the application')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(screen.queryByText('Access is paused')).toBeNull()
  expectPrereleaseBanner(!runtimeFailure)
  for (const renderPrivate of privateRenders) expect(renderPrivate).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(runtimeFailure ? 1 : 2)
})

it.each([true, false])('keeps a retryable pause behind the prerelease boundary for runtime failure %s without mounting private pages', async runtimeFailure => {
  const { api, fetchMock, privateRenders } = await renderPrerelease({ handoff: false, runtimeFailure, status: 503, code: 'prerelease_access_paused' })

  expect(await screen.findByRole('alert')).toHaveTextContent('Access is paused')
  expect(api.getBrowserReloadRequired()).toBe(false)
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(screen.queryByText('Reload the application')).toBeNull()
  expectPrereleaseBanner(!runtimeFailure)
  for (const renderPrivate of privateRenders) expect(renderPrivate).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(runtimeFailure ? 1 : 2)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(runtimeFailure ? 2 : 3))
  expect(screen.getByRole('alert')).toHaveTextContent('Access is paused')
  expect(api.getBrowserReloadRequired()).toBe(false)
  for (const renderPrivate of privateRenders) expect(renderPrivate).not.toHaveBeenCalled()
})
