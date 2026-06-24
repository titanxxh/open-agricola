import { randomBytes, scrypt } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { nanoid } from 'nanoid'
import {
  clearOnboardingCookie,
  ONBOARDING_COOKIE,
  readCookie,
  serializeOnboardingCookie,
  serializeSessionCookie,
  SESSION_COOKIE,
} from '../auth-cookies.ts'
import { createSession, validateSession } from '../auth.ts'
import { getDb } from '../db.ts'
import { assertOAuthProvider, buildOAuthAuthorizationUrl, exchangeOAuthCode } from './providers.ts'
import {
  consumeOAuthState,
  consumeOnboardingTicket,
  createOAuthState,
  createOnboardingTicket,
  findIdentity,
  getLinkedIdentities,
  linkIdentity,
} from './store.ts'
import type { OAuthIntent, OAuthProfile, OAuthProvider } from './types.ts'

const SCRYPT_KEYLEN = 64

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  ...(CORS_ORIGIN !== '*' ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
}

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

function redirect(res: ServerResponse, location: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(302, { Location: location, ...headers })
  res.end()
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS, ...headers })
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
    redirect(res, '/?page=login&authError=unsupported_oauth_provider')
    return
  }

  const intent = parseIntent(url)
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  const user = token ? validateSession(token) : null
  if (intent === 'link' && !user) {
    redirect(res, '/?page=login&authError=not_authenticated')
    return
  }

  const state = createOAuthState({
    provider,
    intent,
    ...(user ? { userId: user.id } : {}),
    ...(url.searchParams.get('returnTo') ? { returnTo: url.searchParams.get('returnTo')! } : {}),
  })
  redirect(res, buildOAuthAuthorizationUrl(provider, state, req))
}

export async function handleOAuthCallback(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (url.searchParams.get('error')) {
    redirect(res, '/?page=login&authError=oauth_cancelled')
    return
  }

  const rawState = url.searchParams.get('state') ?? ''
  const state = consumeOAuthState(rawState)
  if (!state) {
    redirect(res, '/?page=login&authError=oauth_state_invalid')
    return
  }

  let provider: OAuthProvider
  try {
    provider = parseProvider(url)
    if (provider !== state.provider) throw new Error('provider mismatch')
  } catch {
    redirect(res, '/?page=login&authError=oauth_state_invalid')
    return
  }

  let profile: OAuthProfile
  try {
    profile = await exchangeOAuthCode(provider, url.searchParams.get('code') ?? '', req)
  } catch {
    redirect(res, '/?page=login&authError=oauth_profile_failed')
    return
  }

  if (state.intent === 'link') {
    if (!state.userId) {
      redirect(res, '/?page=settings&authError=not_authenticated')
      return
    }
    if (findIdentity(profile.provider, profile.providerUserId)) {
      redirect(res, '/?page=settings&authError=oauth_identity_taken')
      return
    }
    try {
      linkIdentity(state.userId, profile)
      redirect(res, `/?page=settings&linked=${provider}`)
    } catch {
      redirect(res, '/?page=settings&authError=oauth_identity_taken')
    }
    return
  }

  const existing = findIdentity(profile.provider, profile.providerUserId)
  if (existing) {
    const token = createSession(existing.userId)
    redirect(res, state.returnTo ?? '/', { 'Set-Cookie': serializeSessionCookie(token) })
    return
  }

  const ticket = createOnboardingTicket(profile)
  redirect(res, '/?page=onboarding', { 'Set-Cookie': serializeOnboardingCookie(ticket) })
}

export async function handleOnboardingComplete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ticket = readCookie(req.headers.cookie, ONBOARDING_COOKIE)
  const profile = ticket ? consumeOnboardingTicket(ticket) : null
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
  sendJson(res, 200, { ok: true, user: result.user }, {
    'Set-Cookie': [serializeSessionCookie(token), clearOnboardingCookie()],
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
