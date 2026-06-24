import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'

let routeHandler: ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | null = null

vi.mock('node:http', async () => {
  const actual = await vi.importActual<typeof import('node:http')>('node:http')
  return {
    ...actual,
    createServer: (handler: typeof routeHandler) => {
      routeHandler = handler
      return { listen: vi.fn(), on: vi.fn(), close: vi.fn() }
    },
  }
})

vi.mock('../connection/ws-server.ts', () => ({
  createWsServer: () => ({
    lobby: {
      getRooms: () => [],
      dissolveRoomById: () => ({ ok: true }),
    },
  }),
}))

vi.mock('../oauth/providers.ts', () => ({
  assertOAuthProvider: (provider: string) => {
    if (provider !== 'github' && provider !== 'google') throw new Error('unsupported oauth provider')
  },
  buildOAuthAuthorizationUrl: (_provider: string, state: string) => `https://oauth.example/authorize?state=${state}`,
  exchangeOAuthCode: vi.fn(),
}))

vi.mock('../db.ts', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_updated_at INTEGER,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE auth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      provider_login TEXT,
      provider_email TEXT,
      provider_email_verified INTEGER NOT NULL DEFAULT 0,
      display_name TEXT,
      avatar_url TEXT,
      linked_at INTEGER NOT NULL,
      last_login_at INTEGER,
      UNIQUE(provider, provider_user_id),
      UNIQUE(user_id, provider)
    );
    CREATE TABLE oauth_states (
      state_hash TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      intent TEXT NOT NULL,
      user_id TEXT,
      return_to TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE oauth_onboarding_tickets (
      ticket_hash TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      provider_login TEXT,
      provider_email TEXT,
      provider_email_verified INTEGER NOT NULL DEFAULT 0,
      display_name TEXT,
      avatar_url TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    );
  `)
  return { getDb: () => db, cleanExpiredSessions: () => {} }
})

const { createLocalUserForTests, createSession, validateSession } = await import('../auth.ts')
const { createOAuthState, createOnboardingTicket, findIdentity, linkIdentity } = await import('../oauth/store.ts')
const { exchangeOAuthCode } = await import('../oauth/providers.ts')
const { getDb } = await import('../db.ts')

await import('../index.ts')

type JsonResponse = {
  status: number
  headers: Record<string, string | string[]>
  json: Record<string, unknown>
}

class MockReq extends EventEmitter {
  method: string
  url: string
  headers: Record<string, string | undefined>
  socket = { remoteAddress: '127.0.0.1' }

  constructor(method: string, url: string, body: unknown, headers: Record<string, string>) {
    super()
    this.method = method
    this.url = url
    this.headers = { host: 'localhost' }
    for (const [key, value] of Object.entries(headers)) this.headers[key.toLowerCase()] = value
    queueMicrotask(() => {
      if (body !== undefined) this.emit('data', Buffer.from(JSON.stringify(body)))
      this.emit('end')
    })
  }
}

class MockRes {
  statusCode = 200
  headers: Record<string, string | string[]> = {}
  body = ''
  done: Promise<void>
  private finish!: () => void

  constructor() {
    this.done = new Promise(resolve => { this.finish = resolve })
  }

  writeHead(status: number, headers?: Record<string, string | string[]>): void {
    this.statusCode = status
    if (headers) Object.assign(this.headers, headers)
  }

  end(chunk?: string | Buffer): void {
    if (chunk) this.body += chunk.toString()
    this.finish()
  }
}

async function requestJson(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<JsonResponse> {
  if (!routeHandler) throw new Error('route handler was not captured')
  const req = new MockReq(method, url, body, headers) as unknown as IncomingMessage
  const res = new MockRes()
  await routeHandler(req, res as unknown as ServerResponse)
  await res.done
  return {
    status: res.statusCode,
    headers: Object.fromEntries(
      Object.entries(res.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]),
    ),
    json: res.body ? JSON.parse(res.body) as Record<string, unknown> : {},
  }
}

describe('auth routes', () => {
  beforeEach(() => {
    getDb().exec(`
      DELETE FROM oauth_onboarding_tickets;
      DELETE FROM oauth_states;
      DELETE FROM auth_identities;
      DELETE FROM sessions;
      DELETE FROM users;
    `)
  })

  it('login sets an HttpOnly session cookie and does not return token', async () => {
    await createLocalUserForTests('cookieuser', 'password123', 'Cookie User')
    const res = await requestJson('POST', '/api/auth/login', { username: 'cookieuser', password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ ok: true, user: { username: 'cookieuser' } })
    expect(res.json.token).toBeUndefined()
    expect(res.headers['Set-Cookie']).toContain('oa_session=')
    expect(res.headers['Set-Cookie']).toContain('HttpOnly')
    expect(res.headers['Set-Cookie']).toContain('SameSite=Lax')
  })

  it('direct register returns oauth_registration_required', async () => {
    const res = await requestJson('POST', '/api/auth/register', { username: 'blocked', password: 'password123' })
    expect(res.status).toBe(400)
    expect(res.json).toMatchObject({ ok: false, code: 'oauth_registration_required' })
  })

  it('me reads oa_session cookie', async () => {
    const user = await createLocalUserForTests('meuser', 'password123', 'Me User')
    const token = createSession(user.id)
    const res = await requestJson('GET', '/api/auth/me', undefined, { Cookie: `oa_session=${token}` })
    expect(res.status).toBe(200)
    expect((res.json.user as { username: string }).username).toBe('meuser')
  })

  it('logout-all clears every session and clears the browser cookie', async () => {
    const user = await createLocalUserForTests('allout', 'password123', 'All Out')
    const one = createSession(user.id)
    const two = createSession(user.id)
    const res = await requestJson('POST', '/api/auth/logout-all', {}, { Cookie: `oa_session=${one}` })
    expect(res.status).toBe(200)
    expect(validateSession(one)).toBeNull()
    expect(validateSession(two)).toBeNull()
    expect(res.headers['Set-Cookie']).toContain('oa_session=;')
  })

  it('completes onboarding from an oauth ticket and sets a session cookie', async () => {
    const ticket = createOnboardingTicket({
      provider: 'github',
      providerUserId: 'gh-new',
      providerLogin: 'new-gh',
      email: 'new@example.com',
      emailVerified: true,
      displayName: 'New GH',
    })
    const res = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'newuser', displayName: 'New User', password: 'password123', confirmPassword: 'password123' },
      { Cookie: `oa_onboarding=${ticket}` },
    )
    expect(res.status).toBe(200)
    expect((res.json.user as { username: string }).username).toBe('newuser')
    expect(res.headers['Set-Cookie']).toContain('oa_session=')
    expect(findIdentity('github', 'gh-new')?.userId).toBe((res.json.user as { id: string }).id)
  })

  it('rejects onboarding when passwords do not match', async () => {
    const ticket = createOnboardingTicket({ provider: 'google', providerUserId: 'g-new', emailVerified: false })
    const res = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'badpw', password: 'password123', confirmPassword: 'different123' },
      { Cookie: `oa_onboarding=${ticket}` },
    )
    expect(res.status).toBe(400)
    expect(res.json).toMatchObject({ ok: false, code: 'password_mismatch' })
  })

  it('rejects link callback when provider identity is already linked to another user', async () => {
    const linkedUser = await createLocalUserForTests('linkeduser', 'password123', 'Linked User')
    const currentUser = await createLocalUserForTests('currentuser', 'password123', 'Current User')
    const profile = {
      provider: 'github' as const,
      providerUserId: 'gh-linked',
      providerLogin: 'linked-gh',
      emailVerified: true,
    }
    linkIdentity(linkedUser.id, profile)
    vi.mocked(exchangeOAuthCode).mockResolvedValueOnce(profile)

    const state = createOAuthState({ provider: 'github', intent: 'link', userId: currentUser.id })
    const res = await requestJson('GET', `/api/auth/oauth/github/callback?code=ok&state=${state}`)

    expect(res.status).toBe(302)
    expect(res.headers.Location).toContain('page=settings')
    expect(res.headers.Location).toContain('authError=oauth_identity_taken')
    expect(res.headers['Set-Cookie']).toBeUndefined()
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM sessions').get()).toMatchObject({ count: 0 })
  })

  it('allows PATCH in CORS preflight methods', async () => {
    const res = await requestJson('OPTIONS', '/api/auth/profile')
    expect(res.status).toBe(204)
    expect(res.headers['Access-Control-Allow-Methods']).toContain('PATCH')
  })
})
