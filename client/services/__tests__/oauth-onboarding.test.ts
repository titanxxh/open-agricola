// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareOAuthOnboarding } from '../oauth-onboarding'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('OAuth onboarding navigation', () => {
  it('prepares cookie-bound OAuth through the versioned API when Web Crypto digest is unavailable', async () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, authorizationUrl: 'https://github.com/login/oauth/authorize?state=fresh' })))
    vi.stubGlobal('fetch', fetchMock)
    const href = '/api/auth/oauth/github/start?intent=register&inviteCode=oa_test'
    await expect(prepareOAuthOnboarding(href)).resolves.toBe('https://github.com/login/oauth/authorize?state=fresh')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(new URL(url).pathname).toBe('/api/auth/oauth/github/start')
    expect(new URL(url).searchParams.get('inviteCode')).toBe('oa_test')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).get('x-oa-browser-protocol')).toBe('2')
    expect(sessionStorage.length).toBe(0)
  })
})
