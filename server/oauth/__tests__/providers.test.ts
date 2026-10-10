import { afterEach, describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { buildOAuthAuthorizationUrl, buildOAuthCallbackUrl, exchangeOAuthCode } from '../providers.ts'

function fakeReq(origin: string): IncomingMessage {
  const url = new URL(origin)
  return {
    headers: {
      host: url.host,
      'x-forwarded-proto': url.protocol.slice(0, -1),
    },
  } as IncomingMessage
}

describe('oauth providers', () => {
  afterEach(() => {
    delete process.env.ACCOUNT_GITHUB_OAUTH_CLIENT_ID
    delete process.env.ACCOUNT_GITHUB_OAUTH_CLIENT_SECRET
    delete process.env.ACCOUNT_GOOGLE_OAUTH_CLIENT_ID
    delete process.env.ACCOUNT_GOOGLE_OAUTH_CLIENT_SECRET
    delete process.env.GITHUB_OAUTH_CLIENT_ID
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
    delete process.env.PUBLIC_API_BASE
  })

  it('builds GitHub authorization URL with minimal account scopes', () => {
    process.env.ACCOUNT_GITHUB_OAUTH_CLIENT_ID = 'account-gh-client'
    process.env.GITHUB_OAUTH_CLIENT_ID = 'workshop-gh-client'
    const url = new URL(buildOAuthAuthorizationUrl('github', 'state-1', fakeReq('https://app.test')))
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('account-gh-client')
    expect(url.searchParams.get('scope')).toBe('read:user user:email')
    expect(url.searchParams.get('state')).toBe('state-1')
  })

  it('builds Google authorization URL with openid profile email scopes', () => {
    process.env.ACCOUNT_GOOGLE_OAUTH_CLIENT_ID = 'account-google-client'
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'workshop-google-client'
    const url = new URL(buildOAuthAuthorizationUrl('google', 'state-2', fakeReq('https://app.test')))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('account-google-client')
    expect(url.searchParams.get('scope')).toBe('openid profile email')
    expect(url.searchParams.get('state')).toBe('state-2')
  })

  it.each(['github', 'google'] as const)('uses PKCE S256 on %s authorization and exchanges with the server verifier', async (provider) => {
    const url = new URL(buildOAuthAuthorizationUrl(provider, 'state', fakeReq('https://app.test'), 'challenge'))
    expect(url.searchParams.get('code_challenge')).toBe('challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    let body: string | undefined
    const fakeFetch: typeof fetch = async (input, init) => {
      const endpoint = String(input)
      if (endpoint.includes('access_token') || endpoint.endsWith('/token')) {
        body = String(init?.body)
        return new Response(JSON.stringify({ access_token: 'dummy-token' }))
      }
      return new Response(JSON.stringify(endpoint.endsWith('/emails') ? [] : { id: 123, sub: 'google-123' }))
    }
    await exchangeOAuthCode(provider, 'code', fakeReq('https://app.test'), fakeFetch, 'server-verifier')
    const verifier = provider === 'github' ? JSON.parse(body!).code_verifier : new URLSearchParams(body).get('code_verifier')
    expect(verifier).toBe('server-verifier')
  })

  it('does not use workshop OAuth client env names for account auth', () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'workshop-gh-client'
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'workshop-google-client'
    const githubUrl = new URL(buildOAuthAuthorizationUrl('github', 'state-gh', fakeReq('https://app.test')))
    const googleUrl = new URL(buildOAuthAuthorizationUrl('google', 'state-google', fakeReq('https://app.test')))
    expect(githubUrl.searchParams.get('client_id')).toBe('')
    expect(googleUrl.searchParams.get('client_id')).toBe('')
  })

  it('does not exchange account OAuth codes with workshop credentials', async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'workshop-gh-client'
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'workshop-gh-secret'
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'workshop-google-client'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'workshop-google-secret'
    const bodies: string[] = []
    const fakeFetch = async (url: string, init?: RequestInit) => {
      if (init?.body) bodies.push(String(init.body))
      if (url === 'https://github.com/login/oauth/access_token') {
        return new Response(JSON.stringify({ access_token: 'gh-token' }), { status: 200 })
      }
      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ id: 123, login: 'octo' }), { status: 200 })
      }
      if (url === 'https://api.github.com/user/emails') {
        return new Response(JSON.stringify([{ email: 'octo@example.com', primary: true, verified: true }]), { status: 200 })
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'google-token' }), { status: 200 })
      }
      return new Response(JSON.stringify({ sub: 'g-123' }), { status: 200 })
    }
    await exchangeOAuthCode('github', 'code-gh', fakeReq('https://app.test'), fakeFetch as typeof fetch)
    await exchangeOAuthCode('google', 'code-google', fakeReq('https://app.test'), fakeFetch as typeof fetch)
    expect(JSON.parse(bodies[0]!)).toMatchObject({ client_id: '', client_secret: '' })
    expect(new URLSearchParams(bodies[1]).get('client_id')).toBe('')
    expect(new URLSearchParams(bodies[1]).get('client_secret')).toBe('')
  })

  it('uses PUBLIC_API_BASE for provider callback URL', () => {
    process.env.PUBLIC_API_BASE = 'https://api.example/'
    expect(buildOAuthCallbackUrl('github', fakeReq('https://internal.test'))).toBe('https://api.example/api/auth/oauth/github/callback')
  })

  it('normalizes GitHub profile and primary verified email', async () => {
    process.env.ACCOUNT_GITHUB_OAUTH_CLIENT_ID = 'account-gh-client'
    process.env.ACCOUNT_GITHUB_OAUTH_CLIENT_SECRET = 'account-gh-secret'
    const calls: string[] = []
    const bodies: string[] = []
    const fakeFetch = async (url: string, init?: RequestInit) => {
      calls.push(url)
      if (init?.body) bodies.push(String(init.body))
      if (url === 'https://github.com/login/oauth/access_token') {
        return new Response(JSON.stringify({ access_token: 'gh-token' }), { status: 200 })
      }
      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ id: 123, login: 'octo', name: 'Octo', avatar_url: 'https://img.test/a.png' }), { status: 200 })
      }
      return new Response(JSON.stringify([{ email: 'octo@example.com', primary: true, verified: true }]), { status: 200 })
    }
    const profile = await exchangeOAuthCode('github', 'code-1', fakeReq('https://app.test'), fakeFetch as typeof fetch)
    expect(profile).toMatchObject({ provider: 'github', providerUserId: '123', providerLogin: 'octo', email: 'octo@example.com', emailVerified: true })
    expect(calls).toContain('https://api.github.com/user')
    expect(JSON.parse(bodies[0]!)).toMatchObject({
      client_id: 'account-gh-client',
      client_secret: 'account-gh-secret',
    })
  })

  it('normalizes Google OIDC userinfo profile', async () => {
    process.env.ACCOUNT_GOOGLE_OAUTH_CLIENT_ID = 'account-google-client'
    process.env.ACCOUNT_GOOGLE_OAUTH_CLIENT_SECRET = 'account-google-secret'
    const bodies: string[] = []
    const fakeFetch = async (url: string, init?: RequestInit) => {
      if (init?.body) bodies.push(String(init.body))
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'google-token' }), { status: 200 })
      }
      return new Response(JSON.stringify({ sub: 'g-123', email: 'g@example.com', email_verified: true, name: 'Google User', picture: 'https://img.test/g.png' }), { status: 200 })
    }
    const profile = await exchangeOAuthCode('google', 'code-2', fakeReq('https://app.test'), fakeFetch as typeof fetch)
    expect(profile).toMatchObject({ provider: 'google', providerUserId: 'g-123', email: 'g@example.com', emailVerified: true, displayName: 'Google User' })
    expect(new URLSearchParams(bodies[0]).get('client_id')).toBe('account-google-client')
    expect(new URLSearchParams(bodies[0]).get('client_secret')).toBe('account-google-secret')
  })
})
