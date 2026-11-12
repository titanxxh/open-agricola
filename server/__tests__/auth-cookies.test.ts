import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertProductionCookieConfig, authCookieNames, clearSessionCookie, clearOperationsCookie,
  readCookie, readCookies, serializeOnboardingCookie, serializeOAuthStateCookie,
  serializeOperationsCookie, serializeSessionCookie,
} from '../auth-cookies'

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

    expect(serializeSessionCookie('session', options)).toBe('__Host-oa-session=session; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800; Secure')
    expect(clearSessionCookie(options)).toBe('__Host-oa-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure')
    expect(serializeOnboardingCookie('ticket', options)).toBe('__Host-oa-onboarding=ticket; HttpOnly; SameSite=Lax; Path=/; Max-Age=900; Secure')
  })

  it.each([
    ['https://titanxxh.github.io/open-agricola/', 'https://openagapi.titanxxh.com'],
    ['https://alice.github.io/', 'https://bob.github.io'],
    ['https://app.example.co.uk/', 'https://api.other.co.uk'],
    ['https://127.0.0.1/', 'https://127.0.0.2'],
  ])('retains partitioned cookies only for cross-site deployments: %s → %s', (app, api) => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', app)
    vi.stubEnv('PUBLIC_API_BASE', api)

    expect(serializeSessionCookie('session', { requestOrigin: new URL(app).origin })).toBe('__Host-oa-session=session; HttpOnly; SameSite=None; Path=/; Max-Age=604800; Secure; Partitioned')
  })
})


describe('authentication cookie ambiguity', () => {
  it.each([
    '__Host-oa-session=first; __Host-oa-session=second',
    '__Host-oa-session=valid; __Host-oa-session=%',
    '__Host-oa-session=%; __Host-oa-session=valid',
    '__Host-oa-session=valid; __Host-oa-session=',
  ])('rejects every duplicate without selecting a usable value: %s', header => {
    expect(readCookie(header, '__Host-oa-session')).toBe('')
    expect(readCookies(header, '__Host-oa-session')).toEqual([])
  })
})


describe('cookie configuration boundaries', () => {
  it('uses the host prefix for the complete family, including root-path operations', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.example.com/')
    vi.stubEnv('PUBLIC_API_BASE', 'https://api.example.com/open-agricola/')
    expect(serializeOAuthStateCookie('state')).toBe('__Host-oa-oauth-state=state; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure')
    expect(serializeOperationsCookie('ops')).toBe('__Host-oa-ops-session=ops; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800; Secure')
    expect(clearOperationsCookie()).toBe('__Host-oa-ops-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure')
  })

  it('uses distinct development names without a production-cookie fallback', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PUBLIC_APP_ORIGIN', '')
    vi.stubEnv('PUBLIC_API_BASE', '')
    expect(serializeSessionCookie('local')).toBe('oa_dev_session=local; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800')
    expect(serializeOnboardingCookie('local')).toContain('oa_dev_onboarding=local;')
    expect(serializeOAuthStateCookie('local')).toContain('oa_dev_oauth_state=local;')
    expect(serializeOperationsCookie('local')).toContain('oa_dev_ops_session=local;')
    expect(readCookie('__Host-oa-session=production; oa_session=legacy', authCookieNames().session)).toBe('')
    expect(() => assertProductionCookieConfig()).not.toThrow()
  })

  it.each(['', 'http://api.example.com', 'https://user@api.example.com', 'https://api.example.com/?query=1'])('rejects an invalid production API configuration: %s', api => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.example.com')
    vi.stubEnv('PUBLIC_API_BASE', api)
    expect(() => assertProductionCookieConfig()).toThrow('PUBLIC_API_BASE')
    expect(() => serializeSessionCookie('secret', { backendOrigin: 'https://fallback.example.com' })).toThrow('PUBLIC_API_BASE')
  })

  it('requires a configured production app even for operations cookies', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', '')
    vi.stubEnv('PUBLIC_API_BASE', 'https://api.example.com')
    expect(() => serializeOperationsCookie('secret')).toThrow('PUBLIC_APP_ORIGIN')
  })

  it('does not partition cross-site navigation or duplicate Origin headers', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.example.com')
    vi.stubEnv('PUBLIC_API_BASE', 'https://api.example.net')
    expect(serializeSessionCookie('secret')).not.toContain('Partitioned')
    expect(serializeSessionCookie('secret', { requestOrigin: ['https://app.example.com', 'https://pre.example.com'] })).not.toContain('Partitioned')
    expect(serializeOperationsCookie('secret', { requestOrigin: 'https://app.example.com' })).toContain('SameSite=Lax')
  })
})
