import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCookie, serializeOnboardingCookie, serializeSessionCookie } from '../auth-cookies'

beforeEach(() => vi.stubEnv('NODE_ENV', 'production'))
afterEach(() => vi.unstubAllEnvs())

describe('production browser session cookies', () => {
  it.each([
    ['https://open-agricola.titanxxh.com/', 'https://openagapi.titanxxh.com'],
    ['https://app.example.co.uk:8443/', 'https://api.example.co.uk:9443'],
    ['https://app.alice.github.io/', 'https://api.alice.github.io'],
    ['https://localhost:8443/', 'https://localhost:9443'],
    ['https://127.0.0.1:8443/', 'https://127.0.0.1:9443'],
    ['https://[::1]:8443/', 'https://[::1]:9443'],
  ])('keeps same-site requests first-party across origins: %s → %s', (app, api) => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', app)
    vi.stubEnv('PUBLIC_API_BASE', api)
    const options = { requestOrigin: new URL(app).origin }

    expect(serializeSessionCookie('session', options)).toBe('oa_session=session; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800; Secure')
    expect(clearSessionCookie(options)).toBe('oa_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure')
    expect(serializeOnboardingCookie('ticket', options)).toBe('oa_onboarding=ticket; HttpOnly; SameSite=Lax; Path=/; Max-Age=900; Secure')
  })

  it.each([
    ['https://titanxxh.github.io/open-agricola/', 'https://openagapi.titanxxh.com'],
    ['https://alice.github.io/', 'https://bob.github.io'],
    ['https://app.example.co.uk/', 'https://api.other.co.uk'],
    ['https://127.0.0.1/', 'https://127.0.0.2'],
  ])('retains partitioned cookies only for cross-site deployments: %s → %s', (app, api) => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', app)
    vi.stubEnv('PUBLIC_API_BASE', api)

    expect(serializeSessionCookie('session', { requestOrigin: new URL(app).origin })).toBe('oa_session=session; HttpOnly; SameSite=None; Path=/; Max-Age=604800; Secure; Partitioned')
  })
})
