import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalAppLocation } from '../canonical-app-location'

const api = 'https://api.example.test'
const current = 'https://pages.example.test/open-agricola/'
const hosted = `${api}/open-agricola/`
function respond(value: unknown) {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
afterEach(() => vi.unstubAllGlobals())

describe('canonical application entry', () => {
  it('moves old room/replay links before authentication while preserving query and fragment', async () => {
    const fetcher = respond({ mode: 'canonical', appUrl: hosted, buildId: 'build-1' })
    const suffix = '?room=saved-room&step=14&frame=hash&perspective=p2&locale=zh#details'
    expect(await canonicalAppLocation(current + suffix, api)).toBe(hosted + suffix)
    expect(fetcher).toHaveBeenCalledWith(`${api}/api/app-location`, expect.objectContaining({
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    }))
  })

  it('uses the same metadata authority even when API_BASE is empty', async () => {
    const fetcher = respond({ mode: 'canonical', appUrl: hosted, buildId: 'build-1' })
    expect(await canonicalAppLocation(hosted + '?page=login', '')).toBeNull()
    expect(fetcher).toHaveBeenCalledWith(`${api}/api/app-location`, expect.any(Object))
  })

  it('normalizes a canonical-origin index alias without looping on the actual mount', async () => {
    respond({ mode: 'canonical', appUrl: hosted, buildId: 'build-1' })
    expect(await canonicalAppLocation(hosted + 'index.html?room=saved', '')).toBe(hosted + '?room=saved')
    expect(await canonicalAppLocation(hosted + '?room=saved', '')).toBeNull()
  })

  it('moves an alternate hosted origin to the server canonical origin', async () => {
    respond({ mode: 'canonical', appUrl: hosted, buildId: 'build-1' })
    expect(await canonicalAppLocation('https://preview.example.test/open-agricola/?room=saved#details', '')).toBe(hosted + '?room=saved#details')
  })

  it('keeps external Pages, API-only and subpath deployments when hosting is disabled', async () => {
    respond({ mode: 'disabled' })
    expect(await canonicalAppLocation(current, api)).toBeNull()
    expect(await canonicalAppLocation(current, api + '/agricola-api')).toBeNull()
  })

  it('restarts an old-origin bound registration without forwarding its ticket', async () => {
    respond({ mode: 'canonical', appUrl: hosted, buildId: 'build-1' })
    const destination = await canonicalAppLocation(current + '?page=onboarding#onboardingTicket=private-ticket', api)
    expect(destination).toBe(hosted + '?page=login&authMode=register&authError=oauth_onboarding_expired')
    expect(destination).not.toContain('private-ticket')
  })

  it('does not restart a current-origin registration or change its bound fragment', async () => {
    respond({ mode: 'canonical', appUrl: hosted, buildId: 'build-1' })
    expect(await canonicalAppLocation(hosted + '?page=onboarding#onboardingTicket=bound-ticket', '')).toBeNull()
  })

  it('preserves the server-bound account-link callback on entry migration', async () => {
    respond({ mode: 'canonical', appUrl: hosted, buildId: 'build-1' })
    const suffix = '?page=settings#accountLinkCode=code&accountLinkState=bound-state'
    expect(await canonicalAppLocation(current + suffix, api)).toBe(hosted + suffix)
  })

  it.each([
    'https://untrusted.example.test/open-agricola/',
    `${api}/other/`, `${api}/open-agricola/?room=injected`, `${api}/open-agricola/#injected`,
    'https://user:password@api.example.test/open-agricola/',
    'javascript:alert(1)',
  ])('refuses an untrusted or malformed configured app URL: %s', async appUrl => {
    respond({ mode: 'canonical', appUrl, buildId: 'build-1' })
    await expect(canonicalAppLocation(current, api)).rejects.toThrow('Invalid canonical application location')
  })

  it('refuses to downgrade an HTTPS entry to an HTTP canonical app', async () => {
    respond({ mode: 'canonical', appUrl: 'http://api.example.test/open-agricola/', buildId: 'build-1' })
    await expect(canonicalAppLocation(current, 'http://api.example.test')).rejects.toThrow('Invalid canonical application location')
  })

  it.each([{}, { mode: 'canonical', appUrl: hosted }, { mode: 'canonical', appUrl: hosted, buildId: '' }])('rejects malformed metadata instead of treating it as disabled', async value => {
    respond(value)
    await expect(canonicalAppLocation(current, api)).rejects.toThrow('Invalid application location response')
  })

  it('does not start the app when the canonical metadata request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(canonicalAppLocation(current, api)).rejects.toThrow('Application location is unavailable')
  })
})
