export type OAuthProvider = 'github' | 'google'
export type OAuthIntent = 'login' | 'register' | 'link'

export type OAuthProfile = {
  provider: OAuthProvider
  providerUserId: string
  providerLogin?: string
  email?: string
  emailVerified: boolean
  displayName?: string
  avatarUrl?: string
}
