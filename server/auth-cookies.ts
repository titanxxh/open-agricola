export const SESSION_COOKIE = 'oa_session'
export const ONBOARDING_COOKIE = 'oa_onboarding'
export const OAUTH_STATE_COOKIE = 'oa_oauth_state'

type CookieOptions = {
  backendOrigin?: string
  requestOrigin?: string | string[]
}

function originUrl(raw: string | undefined): URL | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

function sameSiteAttribute(options: CookieOptions = {}): string {
  if (process.env.NODE_ENV !== 'production') return 'SameSite=Lax'
  const appOrigin = originUrl(process.env.PUBLIC_APP_ORIGIN)
  const apiOrigin = originUrl(process.env.PUBLIC_API_BASE) ?? originUrl(options.backendOrigin)
  if (appOrigin?.protocol === 'https:' && apiOrigin?.protocol === 'https:' && appOrigin.origin !== apiOrigin.origin) {
    return 'SameSite=None'
  }
  return 'SameSite=Lax'
}

function secureSuffix(options: CookieOptions = {}): string {
  if (process.env.NODE_ENV !== 'production') return ''
  const apiOrigin = originUrl(process.env.PUBLIC_API_BASE) ?? originUrl(options.backendOrigin)
  return apiOrigin?.protocol === 'https:' ? '; Secure' : ''
}

function partitionedSuffix(options: CookieOptions = {}): string {
  if (process.env.NODE_ENV !== 'production') return ''
  const requestOrigin = originUrl(Array.isArray(options.requestOrigin) ? options.requestOrigin[0] : options.requestOrigin)
  const appOrigin = originUrl(process.env.PUBLIC_APP_ORIGIN)
  const apiOrigin = originUrl(process.env.PUBLIC_API_BASE) ?? originUrl(options.backendOrigin)
  return requestOrigin?.origin === appOrigin?.origin &&
    appOrigin?.protocol === 'https:' &&
    apiOrigin?.protocol === 'https:' &&
    appOrigin.origin !== apiOrigin.origin
    ? '; Partitioned'
    : ''
}

export function readCookie(header: string | undefined, name: string): string {
  return readCookies(header, name)[0] ?? ''
}

export function readCookies(header: string | undefined, name: string): string[] {
  if (!header) return []
  const values: string[] = []
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (rawKey !== name) continue
    try {
      values.push(decodeURIComponent(rawValue.join('=')))
    } catch {
    }
  }
  return values
}

export function serializeSessionCookie(token: string, options: CookieOptions = {}): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=604800${secureSuffix(options)}${partitionedSuffix(options)}`
}

export function serializeOnboardingCookie(ticket: string, options: CookieOptions = {}): string {
  return `${ONBOARDING_COOKIE}=${encodeURIComponent(ticket)}; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=900${secureSuffix(options)}`
}

export function serializeOAuthStateCookie(state: string, options: CookieOptions = {}): string {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=600${secureSuffix(options)}`
}

export function clearSessionCookie(options: CookieOptions = {}): string {
  return `${SESSION_COOKIE}=; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=0${secureSuffix(options)}${partitionedSuffix(options)}`
}

export function clearOnboardingCookie(options: CookieOptions = {}): string {
  return `${ONBOARDING_COOKIE}=; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=0${secureSuffix(options)}`
}

export function clearOAuthStateCookie(options: CookieOptions = {}): string {
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; ${sameSiteAttribute(options)}; Path=/; Max-Age=0${secureSuffix(options)}`
}
