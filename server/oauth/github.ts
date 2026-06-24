import type { OAuthProfile } from './types.ts'

type GitHubTokenResponse = {
  access_token?: string
  error?: string
}

type GitHubUserResponse = {
  id?: number | string
  login?: string
  name?: string
  avatar_url?: string
}

type GitHubEmailResponse = {
  email?: string
  primary?: boolean
  verified?: boolean
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error('oauth profile failed')
  return await response.json() as T
}

export async function exchangeGitHubOAuthCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch,
): Promise<OAuthProfile> {
  const tokenResponse = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? '',
      code,
      redirect_uri: redirectUri,
    }),
  })
  const tokenData = await readJson<GitHubTokenResponse>(tokenResponse)
  if (!tokenData.access_token) throw new Error('oauth profile failed')

  const user = await readJson<GitHubUserResponse>(await fetchImpl('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  }))
  if (user.id === undefined || user.id === null) throw new Error('oauth profile failed')

  const emails = await readJson<GitHubEmailResponse[]>(await fetchImpl('https://api.github.com/user/emails', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  }))
  const selectedEmail = emails.find(email => email.primary) ?? emails.find(email => email.verified)

  return {
    provider: 'github',
    providerUserId: String(user.id),
    ...(user.login ? { providerLogin: user.login } : {}),
    ...(selectedEmail?.email ? { email: selectedEmail.email } : {}),
    emailVerified: selectedEmail?.verified === true,
    ...(user.name ? { displayName: user.name } : {}),
    ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
  }
}
