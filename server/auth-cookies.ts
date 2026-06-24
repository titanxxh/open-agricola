export const SESSION_COOKIE = 'oa_session'
export const ONBOARDING_COOKIE = 'oa_onboarding'

const secureSuffix = (): string => process.env.NODE_ENV === 'production' ? '; Secure' : ''

export function readCookie(header: string | undefined, name: string): string {
  if (!header) return ''
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (rawKey === name) return decodeURIComponent(rawValue.join('='))
  }
  return ''
}

export function serializeSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureSuffix()}`
}

export function serializeOnboardingCookie(ticket: string): string {
  return `${ONBOARDING_COOKIE}=${encodeURIComponent(ticket)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900${secureSuffix()}`
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureSuffix()}`
}

export function clearOnboardingCookie(): string {
  return `${ONBOARDING_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureSuffix()}`
}
