import type { OAuthProfile } from './types.ts'

type GoogleTokenResponse = {
  access_token?: string
  error?: string
}

type GoogleUserInfoResponse = {
  sub?: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error('oauth profile failed')
  return await response.json() as T
}

export async function exchangeGoogleOAuthCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch,
): Promise<OAuthProfile> {
  const tokenResponse = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })
  const tokenData = await readJson<GoogleTokenResponse>(tokenResponse)
  if (!tokenData.access_token) throw new Error('oauth profile failed')

  const userInfo = await readJson<GoogleUserInfoResponse>(await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  }))
  if (!userInfo.sub) throw new Error('oauth profile failed')

  return {
    provider: 'google',
    providerUserId: userInfo.sub,
    ...(userInfo.email ? { email: userInfo.email } : {}),
    emailVerified: userInfo.email_verified === true,
    ...(userInfo.name ? { displayName: userInfo.name } : {}),
    ...(userInfo.picture ? { avatarUrl: userInfo.picture } : {}),
  }
}
