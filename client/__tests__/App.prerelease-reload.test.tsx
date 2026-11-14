// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import { StrictMode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

async function renderPrerelease({ handoff, status, code }: {
  handoff: boolean
  status: number
  code: string
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
  } })
  const endpoint = handoff ? '/api/prerelease/session' : '/api/auth/me'
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const path = new URL(url, window.location.origin).pathname
    if (path === '/api/prerelease/runtime') return Response.json({
      ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test',
      formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main',
    })
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

it.each([
  { route: 'session check', handoff: false },
  { route: 'handoff exchange', handoff: true },
])('shows global recovery for reload_required from the $route without mounting private pages', async ({ handoff }) => {
  const { api, fetchMock, privateRenders } = await renderPrerelease({ handoff, status: 426, code: 'reload_required' })

  await waitFor(() => expect(api.getBrowserReloadRequired()).toBe(true))

  expect(await screen.findByRole('alert')).toHaveTextContent('Reload the application')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(screen.queryByText('Access is paused')).toBeNull()
  for (const renderPrivate of privateRenders) expect(renderPrivate).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('keeps a retryable pause behind the prerelease boundary without mounting private pages', async () => {
  const { api, fetchMock, privateRenders } = await renderPrerelease({ handoff: false, status: 503, code: 'prerelease_access_paused' })

  expect(await screen.findByRole('alert')).toHaveTextContent('Access is paused')
  expect(api.getBrowserReloadRequired()).toBe(false)
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(screen.queryByText('Reload the application')).toBeNull()
  for (const renderPrivate of privateRenders) expect(renderPrivate).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
