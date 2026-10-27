// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareOAuthOnboarding } from '../oauth-onboarding'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('OAuth onboarding navigation', () => {
  it('preserves cookie-based navigation when Web Crypto digest is unavailable', async () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
    const href = '/api/auth/oauth/github/start?intent=register&inviteCode=oa_test'
    await expect(prepareOAuthOnboarding(href)).resolves.toBe(href)
    expect(sessionStorage.length).toBe(0)
  })
})
