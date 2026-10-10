import type { IncomingMessage } from 'node:http'
import { exchangeGitHubOAuthCode } from './github.ts'
import { exchangeGoogleOAuthCode } from './google.ts'
import type { OAuthProfile, OAuthProvider } from './types.ts'

export function assertOAuthProvider(provider: string): asserts provider is OAuthProvider {
  if (provider !== 'github' && provider !== 'google') {
    throw new Error('unsupported oauth provider')
  }
}

function deriveBaseUrl(req: IncomingMessage): string {
  if (process.env.PUBLIC_API_BASE) return process.env.PUBLIC_API_BASE.replace(/\/$/, '')
  const host = req.headers.host ?? 'localhost'
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http'
  return `${proto}://${host}`
}

function accountOAuthClientId(provider: OAuthProvider): string {
  if (provider === 'github') return process.env.ACCOUNT_GITHUB_OAUTH_CLIENT_ID ?? ''
  return process.env.ACCOUNT_GOOGLE_OAUTH_CLIENT_ID ?? ''
}

export function buildOAuthCallbackUrl(provider: OAuthProvider, req: IncomingMessage): string {
  return `${deriveBaseUrl(req)}/api/auth/oauth/${provider}/callback`
}

export function buildOAuthAuthorizationUrl(provider: OAuthProvider, state: string, req: IncomingMessage, codeChallenge?: string): string {
  assertOAuthProvider(provider)
  const url = URL.parse(provider === 'github'
    ? 'https://github.com/login/oauth/authorize'
    : 'https://accounts.google.com/o/oauth2/v2/auth')
  if (!url) throw new Error('invalid oauth endpoint')
  url.searchParams.set('client_id', accountOAuthClientId(provider))
  url.searchParams.set('redirect_uri', buildOAuthCallbackUrl(provider, req))
  if (provider === 'google') url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', provider === 'github' ? 'read:user user:email' : 'openid profile email')
  url.searchParams.set('state', state)
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }
  return url.toString()
}

export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code: string,
  req: IncomingMessage,
  fetchImpl: typeof fetch = fetch,
  codeVerifier?: string,
): Promise<OAuthProfile> {
  assertOAuthProvider(provider)
  if (provider === 'github') {
    return exchangeGitHubOAuthCode(code, buildOAuthCallbackUrl(provider, req), fetchImpl, codeVerifier)
  }
  return exchangeGoogleOAuthCode(code, buildOAuthCallbackUrl(provider, req), fetchImpl, codeVerifier)
}
