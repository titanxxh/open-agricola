import { isSameSite } from './http-origin'

export const SESSION_COOKIE = '__Host-oa-session'
export const ONBOARDING_COOKIE = '__Host-oa-onboarding'
export const OAUTH_STATE_COOKIE = '__Host-oa-oauth-state'
export const OPS_COOKIE = '__Host-oa-ops-session'

const productionNames = {
  session: SESSION_COOKIE,
  onboarding: ONBOARDING_COOKIE,
  oauthState: OAUTH_STATE_COOKIE,
  operations: OPS_COOKIE,
}
const developmentNames = {
  session: 'oa_dev_session',
  onboarding: 'oa_dev_onboarding',
  oauthState: 'oa_dev_oauth_state',
  operations: 'oa_dev_ops_session',
}
type CookieKind = keyof typeof productionNames

type CookieOptions = {
  backendOrigin?: string
  requestOrigin?: string | string[]
}

export function authCookieNames(): Readonly<typeof productionNames> {
  return process.env.NODE_ENV === 'production' ? productionNames : developmentNames
}

function configuredHttpsUrl(name: 'PUBLIC_APP_ORIGIN' | 'PUBLIC_API_BASE'): URL {
  const raw = process.env[name]
  if (raw) {
    try {
      const url = new URL(raw)
      if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) return url
    } catch { /* Report the missing or invalid configuration below. */ }
  }
  throw new Error(`${name} must configure an HTTPS URL for production authentication`)
}

export function assertProductionCookieConfig(): void {
  if (process.env.NODE_ENV !== 'production') return
  configuredHttpsUrl('PUBLIC_APP_ORIGIN')
  configuredHttpsUrl('PUBLIC_API_BASE')
}

export function readCookie(header: string | undefined, name: string): string {
  return readCookies(header, name)[0] ?? ''
}

export function readCookies(header: string | undefined, name: string): string[] {
  if (!header) return []
  let found = false
  let value = ''
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (rawKey !== name) continue
    if (found || rawValue.length === 0) return []
    found = true
    try {
      value = decodeURIComponent(rawValue.join('='))
    } catch { return [] }
    if (!value || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return []
  }
  return found ? [value] : []
}

function serialize(kind: CookieKind, value: string, maxAge: number, options: CookieOptions): string {
  let sameSite = 'Lax'
  let secure = ''
  if (process.env.NODE_ENV === 'production') {
    const app = configuredHttpsUrl('PUBLIC_APP_ORIGIN')
    const api = configuredHttpsUrl('PUBLIC_API_BASE')
    const crossSite = !isSameSite(app, api)
    if (crossSite && kind !== 'operations') sameSite = 'None'
    secure = '; Secure'
    if (kind === 'session' && crossSite && options.requestOrigin === app.origin) secure += '; Partitioned'
  }
  return `${authCookieNames()[kind]}=${encodeURIComponent(value)}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secure}`
}

export function serializeSessionCookie(token: string, options: CookieOptions = {}): string {
  return serialize('session', token, 604800, options)
}

export function serializeOnboardingCookie(ticket: string, options: CookieOptions = {}): string {
  return serialize('onboarding', ticket, 900, options)
}

export function serializeOAuthStateCookie(state: string, options: CookieOptions = {}): string {
  return serialize('oauthState', state, 600, options)
}

export function serializeOperationsCookie(token: string, options: CookieOptions = {}): string {
  return serialize('operations', token, 604800, options)
}

export function clearSessionCookie(options: CookieOptions = {}): string {
  return serialize('session', '', 0, options)
}

export function clearOnboardingCookie(options: CookieOptions = {}): string {
  return serialize('onboarding', '', 0, options)
}

export function clearOAuthStateCookie(options: CookieOptions = {}): string {
  return serialize('oauthState', '', 0, options)
}

export function clearOperationsCookie(options: CookieOptions = {}): string {
  return serialize('operations', '', 0, options)
}
