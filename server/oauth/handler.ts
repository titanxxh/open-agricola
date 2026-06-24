import { randomBytes, scrypt } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { nanoid } from 'nanoid'
import {
  clearOnboardingCookie,
  clearOAuthStateCookie,
  ONBOARDING_COOKIE,
  OAUTH_STATE_COOKIE,
  readCookie,
  serializeOnboardingCookie,
  serializeOAuthStateCookie,
  serializeSessionCookie,
  SESSION_COOKIE,
} from '../auth-cookies.ts'
import { createSession, validateSession } from '../auth.ts'
import { getDb } from '../db.ts'
import { corsHeaders, getRequestOrigin } from '../http-origin.ts'
import { assertOAuthProvider, buildOAuthAuthorizationUrl, exchangeOAuthCode } from './providers.ts'
import {
  consumeOAuthState,
  consumeOnboardingTicket,
  createOAuthState,
  createOnboardingTicket,
  findIdentity,
  getOnboardingTicket,
  getLinkedIdentities,
  linkIdentity,
} from './store.ts'
import type { OAuthIntent, OAuthProfile, OAuthProvider } from './types.ts'

const SCRYPT_KEYLEN = 64

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex')
    scrypt(password, salt, SCRYPT_KEYLEN, (err, derived) => {
      if (err) reject(err)
      else resolve(`${salt}:${derived.toString('hex')}`)
    })
  })
}

function validateUsername(username: string): string | null {
  if (!username || username.length < 2 || username.length > 30) return 'Username must be 2-30 characters'
  if (!/^[a-zA-Z0-9_\u4e00-\u9fff]+$/.test(username)) {
    return 'Username can only contain letters, numbers, underscores, or Chinese characters'
  }
  return null
}

function parseProvider(url: URL): OAuthProvider {
  const provider = url.pathname.split('/')[4] ?? ''
  assertOAuthProvider(provider)
  return provider
}

function parseIntent(url: URL): OAuthIntent {
  const intent = url.searchParams.get('intent') ?? 'login'
  if (intent === 'login' || intent === 'register' || intent === 'link') return intent
  return 'login'
}

function safeReturnTo(returnTo: string | null | undefined): string | undefined {
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('\\')) return undefined
  try {
    new URL(returnTo, 'http://open-agricola.local')
    return returnTo
  } catch {
    return undefined
  }
}

function frontendBaseUrl(): URL | undefined {
  const raw = process.env.PUBLIC_APP_ORIGIN
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.search = ''
    url.hash = ''
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    return url
  } catch {
    return undefined
  }
}

function stripFrontendBasePath(path: string, baseUrl: URL): string {
  const basePath = baseUrl.pathname.replace(/\/$/, '')
  if (!basePath) return path
  if (path === basePath) return '/'
  if (path.startsWith(`${basePath}/`)) return path.slice(basePath.length) || '/'
  return path
}

function appLocation(path: string): string {
  const safePath = safeReturnTo(path) ?? '/'
  const baseUrl = frontendBaseUrl()
  if (!baseUrl) return safePath
  const appPath = stripFrontendBasePath(safePath, baseUrl)
  return new URL(appPath.replace(/^\//, ''), baseUrl).toString()
}

function redirect(res: ServerResponse, location: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(302, { Location: location, ...headers })
  res.end()
}

function appendSetCookie(headers: Record<string, string | string[]>, cookie: string): Record<string, string | string[]> {
  const existing = headers['Set-Cookie']
  if (!existing) return { ...headers, 'Set-Cookie': cookie }
  return {
    ...headers,
    'Set-Cookie': Array.isArray(existing) ? [...existing, cookie] : [existing, cookie],
  }
}

function oauthStateClearHeaders(
  req: IncomingMessage,
  headers: Record<string, string | string[]> = {},
): Record<string, string | string[]> {
  return appendSetCookie(headers, clearOAuthStateCookie({ backendOrigin: getRequestOrigin(req) }))
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders(), ...headers })
  res.end(JSON.stringify(payload))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
  })
}

async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  try {
    return JSON.parse(await readBody(req)) as T
  } catch {
    return null
  }
}

async function createLocalUserForOnboarding(username: string, password: string, displayName: string | undefined, profile: OAuthProfile) {
  const name = username.trim()
  const usernameError = validateUsername(name)
  if (usernameError) return { ok: false as const, code: 'invalid_username', error: usernameError }
  if (!password || password.length < 8) {
    return { ok: false as const, code: 'invalid_password', error: 'Password must be at least 8 characters' }
  }

  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(name)
  if (existing) return { ok: false as const, code: 'username_taken', error: 'Username already taken' }

  const id = nanoid()
  const passwordHash = await hashPassword(password)
  const now = Date.now()
  const localDisplayName = displayName?.trim() || profile.displayName?.trim() || name

  try {
    db.transaction(() => {
      db.prepare(
        'INSERT INTO users (id, username, display_name, password_hash, password_updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, name, localDisplayName, passwordHash, now, now)
      linkIdentity(id, profile)
    })()
  } catch (err) {
    if (err instanceof Error && /linked/.test(err.message)) {
      return { ok: false as const, code: 'oauth_identity_taken', error: 'OAuth identity is already linked' }
    }
    throw err
  }

  return { ok: true as const, user: { id, username: name, displayName: localDisplayName } }
}

export function handleOAuthStart(req: IncomingMessage, res: ServerResponse, url: URL): void {
  let provider: OAuthProvider
  try {
    provider = parseProvider(url)
  } catch {
    redirect(res, appLocation('/?page=login&authError=unsupported_oauth_provider'))
    return
  }

  const intent = parseIntent(url)
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  const user = token ? validateSession(token) : null
  if (intent === 'link' && !user) {
    redirect(res, appLocation('/?page=login&authError=not_authenticated'))
    return
  }

  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
  const state = createOAuthState({
    provider,
    intent,
    ...(user ? { userId: user.id } : {}),
    ...(returnTo ? { returnTo } : {}),
  })
  redirect(res, buildOAuthAuthorizationUrl(provider, state, req), {
    'Set-Cookie': serializeOAuthStateCookie(state, { backendOrigin: getRequestOrigin(req) }),
  })
}

export async function handleOAuthCallback(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (url.searchParams.get('error')) {
    redirect(res, appLocation('/?page=login&authError=oauth_cancelled'), oauthStateClearHeaders(req))
    return
  }

  const rawState = url.searchParams.get('state') ?? ''
  const cookieState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE)
  if (!rawState || cookieState !== rawState) {
    redirect(res, appLocation('/?page=login&authError=oauth_state_invalid'), oauthStateClearHeaders(req))
    return
  }

  const state = consumeOAuthState(rawState)
  if (!state) {
    redirect(res, appLocation('/?page=login&authError=oauth_state_invalid'), oauthStateClearHeaders(req))
    return
  }

  let provider: OAuthProvider
  try {
    provider = parseProvider(url)
    if (provider !== state.provider) throw new Error('provider mismatch')
  } catch {
    redirect(res, appLocation('/?page=login&authError=oauth_state_invalid'), oauthStateClearHeaders(req))
    return
  }

  if (state.intent === 'link') {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE)
    const currentUser = token ? validateSession(token) : null
    if (!state.userId || !currentUser || currentUser.id !== state.userId) {
      redirect(res, appLocation('/?page=settings&authError=not_authenticated'), oauthStateClearHeaders(req))
      return
    }
  }

  let profile: OAuthProfile
  try {
    profile = await exchangeOAuthCode(provider, url.searchParams.get('code') ?? '', req)
  } catch {
    redirect(res, appLocation('/?page=login&authError=oauth_profile_failed'), oauthStateClearHeaders(req))
    return
  }

  if (state.intent === 'link') {
    if (!state.userId) {
      redirect(res, appLocation('/?page=settings&authError=not_authenticated'), oauthStateClearHeaders(req))
      return
    }
    if (findIdentity(profile.provider, profile.providerUserId)) {
      redirect(res, appLocation('/?page=settings&authError=oauth_identity_taken'), oauthStateClearHeaders(req))
      return
    }
    try {
      linkIdentity(state.userId, profile)
      redirect(res, appLocation(`/?page=settings&linked=${provider}`), oauthStateClearHeaders(req))
    } catch {
      redirect(res, appLocation('/?page=settings&authError=oauth_identity_taken'), oauthStateClearHeaders(req))
    }
    return
  }

  const existing = findIdentity(profile.provider, profile.providerUserId)
  if (existing) {
    const token = createSession(existing.userId)
    redirect(res, appLocation(safeReturnTo(state.returnTo) ?? '/'), oauthStateClearHeaders(req, {
      'Set-Cookie': serializeSessionCookie(token, { backendOrigin: getRequestOrigin(req) }),
    }))
    return
  }

  const ticket = createOnboardingTicket(profile)
  redirect(res, appLocation('/?page=onboarding'), oauthStateClearHeaders(req, {
    'Set-Cookie': serializeOnboardingCookie(ticket, { backendOrigin: getRequestOrigin(req) }),
  }))
}

export async function handleOnboardingComplete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ticket = readCookie(req.headers.cookie, ONBOARDING_COOKIE)
  const profile = ticket ? getOnboardingTicket(ticket) : null
  if (!profile) {
    sendJson(res, 400, { ok: false, code: 'oauth_onboarding_expired', error: 'Onboarding ticket is missing or expired' })
    return
  }

  const body = await parseBody<{ username?: string; displayName?: string; password?: string; confirmPassword?: string }>(req)
  if (!body?.username || !body.password) {
    sendJson(res, 400, { ok: false, code: 'invalid_username', error: 'Missing username or password' })
    return
  }
  if (body.password !== body.confirmPassword) {
    sendJson(res, 400, { ok: false, code: 'password_mismatch', error: 'Passwords do not match' })
    return
  }

  const result = await createLocalUserForOnboarding(body.username, body.password, body.displayName, profile)
  if (!result.ok) {
    sendJson(res, 400, result)
    return
  }

  const token = createSession(result.user.id)
  consumeOnboardingTicket(ticket)
  sendJson(res, 200, { ok: true, user: result.user }, {
    'Set-Cookie': [
      serializeSessionCookie(token, { backendOrigin: getRequestOrigin(req) }),
      clearOnboardingCookie({ backendOrigin: getRequestOrigin(req) }),
    ],
  })
}

export function handleLinkedIdentities(req: IncomingMessage, res: ServerResponse): void {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  const user = token ? validateSession(token) : null
  if (!user) {
    sendJson(res, 401, { ok: false, code: 'not_authenticated', error: 'Not authenticated' })
    return
  }
  sendJson(res, 200, { ok: true, identities: getLinkedIdentities(user.id) })
}
