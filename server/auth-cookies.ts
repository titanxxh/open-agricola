export const SESSION_COOKIE = 'oa_session'
export const ONBOARDING_COOKIE = 'oa_onboarding'

const secureSuffix = (): string => process.env.NODE_ENV === 'production' ? '; Secure' : ''

type CookieOptions = {
  backendOrigin?: string
}

function originOf(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function sameSiteAttribute(options: CookieOptions = {}): string {
  if (process.env.NODE_ENV !== 'production') return 'SameSite=Lax'
  const appOrigin = originOf(process.env.PUBLIC_APP_ORIGIN)
  const apiOrigin = originOf(process.env.PUBLIC_API_BASE) ?? originOf(options.backendOrigin)
  return appOrigin && apiOrigin && appOrigin !== apiOrigin ? 'SameSite=None' : 'SameSite=Lax'
}

export function readCookie(header: string | undefined, name: string): string {
  if (!header) return ''
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (rawKey !== name) continue
    try {
      return decodeURIComponent(rawValue.join('='))
    } catch {
      return ''
    }
  }
  return ''
}

export function serializeSessionCookie(token: string, options: CookieOptions = {}): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=604800${secureSuffix()}`
}

export function serializeOnboardingCookie(ticket: string, options: CookieOptions = {}): string {
  return `${ONBOARDING_COOKIE}=${encodeURIComponent(ticket)}; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=900${secureSuffix()}`
}

export function clearSessionCookie(options: CookieOptions = {}): string {
  return `${SESSION_COOKIE}=; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=0${secureSuffix()}`
}

export function clearOnboardingCookie(options: CookieOptions = {}): string {
  return `${ONBOARDING_COOKIE}=; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=0${secureSuffix()}`
}
