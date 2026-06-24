import { describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { buildOAuthAuthorizationUrl, exchangeOAuthCode } from '../providers.ts'

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
  it('builds GitHub authorization URL with minimal account scopes', () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'gh-client'
    const url = new URL(buildOAuthAuthorizationUrl('github', 'state-1', fakeReq('https://app.test')))
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('gh-client')
    expect(url.searchParams.get('scope')).toBe('read:user user:email')
    expect(url.searchParams.get('state')).toBe('state-1')
  })

  it('builds Google authorization URL with openid profile email scopes', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'google-client'
    const url = new URL(buildOAuthAuthorizationUrl('google', 'state-2', fakeReq('https://app.test')))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('google-client')
    expect(url.searchParams.get('scope')).toBe('openid profile email')
    expect(url.searchParams.get('state')).toBe('state-2')
  })

  it('normalizes GitHub profile and primary verified email', async () => {
    const calls: string[] = []
    const fakeFetch = async (url: string) => {
      calls.push(url)
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
  })

  it('normalizes Google OIDC userinfo profile', async () => {
    const fakeFetch = async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'google-token' }), { status: 200 })
      }
      return new Response(JSON.stringify({ sub: 'g-123', email: 'g@example.com', email_verified: true, name: 'Google User', picture: 'https://img.test/g.png' }), { status: 200 })
    }
    const profile = await exchangeOAuthCode('google', 'code-2', fakeReq('https://app.test'), fakeFetch as typeof fetch)
    expect(profile).toMatchObject({ provider: 'google', providerUserId: 'g-123', email: 'g@example.com', emailVerified: true, displayName: 'Google User' })
  })
})
