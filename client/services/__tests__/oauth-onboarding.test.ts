// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startOAuthOnboarding } from '../oauth-onboarding'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

for (const secure of [false, true]) describe(`OAuth onboarding navigation with Web Crypto ${secure ? 'available' : 'unavailable'}`, () => {
  it('submits a versioned top-level form and retains the onboarding browser binding', async () => {
    vi.stubGlobal('crypto', secure ? webcrypto : { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, authorizationUrl: 'https://github.com/login/oauth/authorize?state=fresh' })))
    vi.stubGlobal('fetch', fetchMock)
    const submitted: Array<{ method: string; action: string; target: string; fields: Record<string, FormDataEntryValue> }> = []
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      submitted.push({ method: this.method, action: this.action, target: this.target, fields: Object.fromEntries(new FormData(this)) })
    })
    const href = '/api/auth/oauth/github/start?intent=register&inviteCode=oa_test&returnTo=%2F%3Fpage%3Dworkshop'
    await startOAuthOnboarding(href)
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({ method: 'post', target: '_self', fields: { protocol: '2', intent: 'register', inviteCode: 'oa_test', returnTo: '/?page=workshop' } })
    expect(new URL(submitted[0]!.action).pathname).toBe('/api/auth/oauth/github/start')
    expect(new URL(submitted[0]!.action).search).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.querySelector('form')).toBeNull()
    if (secure) {
      const verifier = sessionStorage.getItem('open-agricola-onboarding-verifier')
      expect(verifier).toMatch(/^[a-f0-9]{64}$/)
      const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier!))
      expect(submitted[0]!.fields.onboardingChallenge).toBe(Buffer.from(digest).toString('hex'))
    } else {
      expect(submitted[0]!.fields).not.toHaveProperty('onboardingChallenge')
      expect(sessionStorage.length).toBe(0)
    }
  })
})
