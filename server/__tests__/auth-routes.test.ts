import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'

let routeHandler: ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | null = null
const originalNodeEnv = process.env.NODE_ENV
const wsServerMocks = vi.hoisted(() => ({
  endRoomsForUser: vi.fn(() => ({ endedRoomIds: [] })),
  closeUserConnections: vi.fn(),
}))

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
      endRoomsForUser: wsServerMocks.endRoomsForUser,
    },
    closeUserConnections: wsServerMocks.closeUserConnections,
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
      return_to TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE account_invites (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      used_at INTEGER,
      revoked_at INTEGER
    );
    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      created_by TEXT REFERENCES users(id),
      state_json TEXT,
      max_players INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'waiting',
      version INTEGER NOT NULL DEFAULT 0,
      custom_card_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE room_players (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      player_index INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, user_id)
    );
    CREATE TABLE workshop_cards (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id),
      card_id TEXT NOT NULL,
      card_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      card_json TEXT NOT NULL,
      code_manifest TEXT,
      art_url TEXT,
      art_prompt TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      featured INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE card_likes (
      user_id TEXT NOT NULL REFERENCES users(id),
      card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, card_id)
    );
    CREATE TABLE card_comments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE sandbox_cards (
      user_id TEXT NOT NULL REFERENCES users(id),
      workshop_card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, workshop_card_id)
    );
    CREATE TABLE sandbox_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      player_count INTEGER NOT NULL DEFAULT 2,
      deck_ids_json TEXT NOT NULL DEFAULT '["A","B","C","D","E"]',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE workshop_card_versions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
      card_json TEXT NOT NULL,
      code_manifest TEXT,
      art_url TEXT,
      version_number INTEGER NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE github_propose_rate_limit (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      last_propose_at INTEGER NOT NULL
    );
    CREATE TABLE github_propose_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      workshop_card_id TEXT NOT NULL,
      action TEXT NOT NULL,
      pr_url TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL
    );
  `)
  return { getDb: () => db, cleanExpiredSessions: () => {} }
})

const { createLocalUserForTests, createSession, validateSession } = await import('../auth.ts')
const { createOAuthState, createOnboardingTicket, findIdentity, linkIdentity } = await import('../oauth/store.ts')
const { exchangeOAuthCode } = await import('../oauth/providers.ts')
const { createInvite } = await import('../invites.ts')
const { getDb } = await import('../db.ts')
const { OAUTH_STATE_COOKIE, SESSION_COOKIE } = await import('../auth-cookies.ts')

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

function cookiePairFromSetCookie(header: string | string[] | undefined, name: string): string {
  const raw = Array.isArray(header) ? header.find(value => value.includes(`${name}=`)) : String(header ?? '')
  const part = raw.split(', ').find(value => value.includes(`${name}=`)) ?? raw
  const match = part.match(new RegExp(`${name}=[^;]*`))
  if (!match) throw new Error(`missing ${name} cookie`)
  return match[0]
}

function oauthCookieForState(state: string): string {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}`
}

function startOAuthCookie(res: JsonResponse): string {
  return cookiePairFromSetCookie(res.headers['Set-Cookie'], OAUTH_STATE_COOKIE)
}

describe('auth routes', () => {
  beforeEach(() => {
    wsServerMocks.endRoomsForUser.mockClear()
    wsServerMocks.closeUserConnections.mockClear()
    process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
    getDb().exec(`
      DELETE FROM github_propose_audit;
      DELETE FROM github_propose_rate_limit;
      DELETE FROM workshop_card_versions;
      DELETE FROM sandbox_cards;
      DELETE FROM sandbox_settings;
      DELETE FROM card_comments;
      DELETE FROM card_likes;
      DELETE FROM workshop_cards;
      DELETE FROM room_players;
      DELETE FROM rooms;
      DELETE FROM account_invites;
      DELETE FROM oauth_onboarding_tickets;
      DELETE FROM oauth_states;
      DELETE FROM auth_identities;
      DELETE FROM sessions;
      DELETE FROM users;
    `)
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    delete process.env.ENABLE_AUTH_TEST_HELPERS
    delete process.env.PUBLIC_APP_ORIGIN
    delete process.env.PUBLIC_API_BASE
    delete process.env.CORS_ORIGIN
    delete process.env.ACCOUNT_REGISTRATION_POLICY
    delete process.env.ADMIN_USERS
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

  it('delete account requires authentication', async () => {
    const res = await requestJson('DELETE', '/api/auth/account')

    expect(res.status).toBe(401)
    expect(res.json).toMatchObject({ ok: false, code: 'not_authenticated' })
    expect(wsServerMocks.endRoomsForUser).not.toHaveBeenCalled()
  })

  it('delete account removes the current user and clears the session cookie', async () => {
    const user = await createLocalUserForTests('delete_route', 'password123', 'Delete Route')
    const token = createSession(user.id)
    const now = Date.now()
    getDb().prepare(`
      INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at)
      VALUES (?, ?, ?, 2, 'playing', 1, '[]', ?, ?)
    `).run('route-room', user.id, '{"private":"name"}', now, now)
    getDb().prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)')
      .run('route-room', user.id, 0, now)

    const res = await requestJson('DELETE', '/api/auth/account', undefined, {
      Cookie: `${SESSION_COOKIE}=${token}`,
    })

    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true })
    expect(res.headers['Set-Cookie']).toContain(`${SESSION_COOKIE}=;`)
    expect(validateSession(token)).toBeNull()
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(user.id) as { n: number }).n).toBe(0)
    expect(wsServerMocks.endRoomsForUser).toHaveBeenCalledWith(user.id)
    expect(wsServerMocks.closeUserConnections).toHaveBeenCalledWith(user.id)
  })

  it('uses cross-site cookie attributes for production frontend and backend origins', async () => {
    process.env.NODE_ENV = 'production'
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example'
    process.env.PUBLIC_API_BASE = 'https://api.example'
    await createLocalUserForTests('crosscookie', 'password123', 'Cross Cookie')
    const res = await requestJson('POST', '/api/auth/login', { username: 'crosscookie', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.headers['Set-Cookie']).toContain('SameSite=None')
    expect(res.headers['Set-Cookie']).toContain('Secure')
  })

  it('keeps same-site production cookies on SameSite=Lax', async () => {
    process.env.NODE_ENV = 'production'
    process.env.PUBLIC_APP_ORIGIN = 'https://app.example'
    process.env.PUBLIC_API_BASE = 'https://app.example'
    await createLocalUserForTests('samecookie', 'password123', 'Same Cookie')
    const res = await requestJson('POST', '/api/auth/login', { username: 'samecookie', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.headers['Set-Cookie']).toContain('SameSite=Lax')
    expect(res.headers['Set-Cookie']).toContain('Secure')
  })

  it('uses request-derived backend origin for cross-site production cookies without PUBLIC_API_BASE', async () => {
    process.env.NODE_ENV = 'production'
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example'
    await createLocalUserForTests('reqcookie', 'password123', 'Request Cookie')
    const res = await requestJson(
      'POST',
      '/api/auth/login',
      { username: 'reqcookie', password: 'password123' },
      { Host: 'api.example', 'X-Forwarded-Proto': 'https' },
    )

    expect(res.status).toBe(200)
    expect(res.headers['Set-Cookie']).toContain('SameSite=None')
    expect(res.headers['Set-Cookie']).toContain('Secure')
  })

  it('keeps production-env cookies usable on http dev launch origins', async () => {
    process.env.NODE_ENV = 'production'
    process.env.PUBLIC_APP_ORIGIN = 'http://frontend.example:5173'
    await createLocalUserForTests('httpcookie', 'password123', 'HTTP Cookie')
    const res = await requestJson(
      'POST',
      '/api/auth/login',
      { username: 'httpcookie', password: 'password123' },
      { Host: 'frontend.example:5175', 'X-Forwarded-Proto': 'http' },
    )

    expect(res.status).toBe(200)
    expect(res.headers['Set-Cookie']).toContain('SameSite=Lax')
    expect(res.headers['Set-Cookie']).not.toContain('Secure')
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

  it('rejects cross-site cookie-backed mutation requests', async () => {
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example'
    const user = await createLocalUserForTests('csrfuser', 'password123', 'CSRF User')
    const one = createSession(user.id)
    const two = createSession(user.id)

    const rejected = await requestJson(
      'POST',
      '/api/auth/logout-all',
      {},
      { Cookie: `oa_session=${one}`, Origin: 'https://evil.example' },
    )

    expect(rejected.status).toBe(403)
    expect(rejected.json).toMatchObject({ ok: false, code: 'csrf_rejected' })
    expect(validateSession(one)?.username).toBe('csrfuser')
    expect(validateSession(two)?.username).toBe('csrfuser')

    const allowed = await requestJson(
      'POST',
      '/api/auth/logout-all',
      {},
      { Cookie: `oa_session=${one}`, Origin: 'https://frontend.example' },
    )

    expect(allowed.status).toBe(200)
    expect(validateSession(one)).toBeNull()
    expect(validateSession(two)).toBeNull()
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

  it('preserves onboarding ticket after password mismatch and allows retry', async () => {
    const ticket = createOnboardingTicket({ provider: 'google', providerUserId: 'g-retry', emailVerified: false })
    const mismatch = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'retryuser', password: 'password123', confirmPassword: 'different123' },
      { Cookie: `oa_onboarding=${ticket}` },
    )
    expect(mismatch.status).toBe(400)
    expect(mismatch.json).toMatchObject({ ok: false, code: 'password_mismatch' })

    const retry = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'retryuser', password: 'password123', confirmPassword: 'password123' },
      { Cookie: `oa_onboarding=${ticket}` },
    )
    expect(retry.status).toBe(200)
    expect((retry.json.user as { username: string }).username).toBe('retryuser')
    expect(findIdentity('google', 'g-retry')?.userId).toBe((retry.json.user as { id: string }).id)
  })

  it('preserves onboarding ticket after duplicate username and allows retry', async () => {
    await createLocalUserForTests('takenname', 'password123', 'Taken Name')
    const ticket = createOnboardingTicket({ provider: 'github', providerUserId: 'gh-retry', emailVerified: true })
    const duplicate = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'takenname', password: 'password123', confirmPassword: 'password123' },
      { Cookie: `oa_onboarding=${ticket}` },
    )
    expect(duplicate.status).toBe(400)
    expect(duplicate.json).toMatchObject({ ok: false, code: 'username_taken' })

    const retry = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'uniquename', password: 'password123', confirmPassword: 'password123' },
      { Cookie: `oa_onboarding=${ticket}` },
    )
    expect(retry.status).toBe(200)
    expect((retry.json.user as { username: string }).username).toBe('uniquename')
    expect(findIdentity('github', 'gh-retry')?.userId).toBe((retry.json.user as { id: string }).id)
  })

  it('reports the current registration policy', async () => {
    process.env.ACCOUNT_REGISTRATION_POLICY = 'invite_only'

    const res = await requestJson('GET', '/api/auth/registration-policy')

    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ ok: true, policy: 'invite_only' })
  })

  it('requires an invite code for invite-only onboarding', async () => {
    process.env.ACCOUNT_REGISTRATION_POLICY = 'invite_only'
    const ticket = createOnboardingTicket({ provider: 'github', providerUserId: 'gh-no-invite', emailVerified: true })

    const res = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'noinvite', password: 'password123', confirmPassword: 'password123' },
      { Cookie: `oa_onboarding=${ticket}` },
    )

    expect(res.status).toBe(400)
    expect(res.json).toMatchObject({ ok: false, code: 'invalid_invite' })
    expect(findIdentity('github', 'gh-no-invite')).toBeNull()
  })

  it('consumes a valid invite during invite-only onboarding', async () => {
    process.env.ACCOUNT_REGISTRATION_POLICY = 'invite_only'
    const admin = await createLocalUserForTests('admin_inviter', 'password123', 'Admin Inviter')
    const invite = createInvite(admin.id, 7)
    const ticket = createOnboardingTicket({ provider: 'github', providerUserId: 'gh-invited', emailVerified: true })

    const res = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'invited', password: 'password123', confirmPassword: 'password123', inviteCode: invite.code },
      { Cookie: `oa_onboarding=${ticket}` },
    )

    expect(res.status).toBe(200)
    const userId = (res.json.user as { id: string }).id
    expect(findIdentity('github', 'gh-invited')?.userId).toBe(userId)
    const row = getDb().prepare('SELECT used_by, used_at FROM account_invites WHERE id = ?').get(invite.id) as {
      used_by: string
      used_at: number
    }
    expect(row.used_by).toBe(userId)
    expect(row.used_at).toBeGreaterThan(0)
  })

  it('rejects a reused invite and keeps the onboarding ticket retryable', async () => {
    process.env.ACCOUNT_REGISTRATION_POLICY = 'invite_only'
    const admin = await createLocalUserForTests('reuse_admin', 'password123', 'Reuse Admin')
    const firstTicket = createOnboardingTicket({ provider: 'github', providerUserId: 'gh-first', emailVerified: true })
    const secondTicket = createOnboardingTicket({ provider: 'github', providerUserId: 'gh-second', emailVerified: true })
    const invite = createInvite(admin.id, 7)

    const first = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'firstinvite', password: 'password123', confirmPassword: 'password123', inviteCode: invite.code },
      { Cookie: `oa_onboarding=${firstTicket}` },
    )
    expect(first.status).toBe(200)

    const second = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'secondinvite', password: 'password123', confirmPassword: 'password123', inviteCode: invite.code },
      { Cookie: `oa_onboarding=${secondTicket}` },
    )

    expect(second.status).toBe(400)
    expect(second.json).toMatchObject({ ok: false, code: 'invalid_invite' })
    expect(findIdentity('github', 'gh-second')).toBeNull()
  })

  it('requires admin access to create invites', async () => {
    process.env.ADMIN_USERS = 'admin'
    const nonAdmin = await createLocalUserForTests('regular_user', 'password123', 'Regular User')
    const token = createSession(nonAdmin.id)

    const unauthenticated = await requestJson('POST', '/api/admin/invites', { expiresInDays: 7 })
    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.json).toMatchObject({ ok: false, code: 'not_authenticated' })

    const forbidden = await requestJson(
      'POST',
      '/api/admin/invites',
      { expiresInDays: 7 },
      { Cookie: `oa_session=${token}` },
    )
    expect(forbidden.status).toBe(403)
    expect(forbidden.json).toMatchObject({ ok: false, code: 'admin_required' })
  })

  it('lets admins create and list invites without exposing plaintext codes in the list', async () => {
    process.env.ADMIN_USERS = 'admin'
    const admin = await createLocalUserForTests('admin', 'password123', 'Admin')
    const token = createSession(admin.id)

    const created = await requestJson(
      'POST',
      '/api/admin/invites',
      { expiresInDays: 7 },
      { Cookie: `oa_session=${token}` },
    )

    expect(created.status).toBe(200)
    expect(created.json).toMatchObject({ ok: true })
    const code = ((created.json.invite as Record<string, unknown>).code as string)
    expect(code).toMatch(/^oa_/)

    const listed = await requestJson('GET', '/api/admin/invites', undefined, { Cookie: `oa_session=${token}` })
    expect(listed.status).toBe(200)
    expect(JSON.stringify(listed.json)).not.toContain(code)
    expect((listed.json.invites as Array<{ status: string }>)[0].status).toBe('active')
  })

  it('lets admins revoke unused invites', async () => {
    process.env.ADMIN_USERS = 'admin'
    const admin = await createLocalUserForTests('admin', 'password123', 'Admin')
    const token = createSession(admin.id)
    const invite = createInvite(admin.id, 7)

    const revoked = await requestJson(
      'POST',
      `/api/admin/invites/${invite.id}/revoke`,
      {},
      { Cookie: `oa_session=${token}` },
    )

    expect(revoked.status).toBe(200)
    expect(revoked.json).toMatchObject({ ok: true })
    const listed = await requestJson('GET', '/api/admin/invites', undefined, { Cookie: `oa_session=${token}` })
    const row = (listed.json.invites as Array<{ id: string; status: string }>).find(inviteRow => inviteRow.id === invite.id)
    expect(row?.status).toBe('revoked')
  })

  it('blocks new onboarding when registration is disabled', async () => {
    process.env.ACCOUNT_REGISTRATION_POLICY = 'disabled'
    const ticket = createOnboardingTicket({ provider: 'google', providerUserId: 'g-disabled', emailVerified: true })

    const res = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      { username: 'disableduser', password: 'password123', confirmPassword: 'password123' },
      { Cookie: `oa_onboarding=${ticket}` },
    )

    expect(res.status).toBe(400)
    expect(res.json).toMatchObject({ ok: false, code: 'registration_disabled' })
    expect(findIdentity('google', 'g-disabled')).toBeNull()
  })

  it('allows existing OAuth users to log in when registration is disabled', async () => {
    process.env.ACCOUNT_REGISTRATION_POLICY = 'disabled'
    const existing = await createLocalUserForTests('existing_oauth', 'password123', 'Existing OAuth')
    linkIdentity(existing.id, {
      provider: 'github',
      providerUserId: 'gh-existing-disabled',
      providerLogin: 'existing-gh',
      emailVerified: true,
    })
    vi.mocked(exchangeOAuthCode).mockResolvedValueOnce({
      provider: 'github',
      providerUserId: 'gh-existing-disabled',
      providerLogin: 'existing-gh',
      emailVerified: true,
    })
    const start = await requestJson('GET', '/api/auth/oauth/github/start?intent=login')
    const state = new URL(String(start.headers.Location)).searchParams.get('state') ?? ''

    const callback = await requestJson(
      'GET',
      `/api/auth/oauth/github/callback?code=ok&state=${encodeURIComponent(state)}`,
      undefined,
      { Cookie: startOAuthCookie(start) },
    )

    expect(callback.status).toBe(302)
    expect(callback.headers['Set-Cookie']).toContain('oa_session=')
  })

  it('test oauth helper is unavailable by default', async () => {
    delete process.env.ENABLE_AUTH_TEST_HELPERS
    const res = await requestJson('POST', '/api/test/oauth/github/callback', { providerUserId: 'x' })
    expect(res.status).toBe(404)
  })

  it('test oauth helper creates onboarding cookie when explicitly enabled outside production', async () => {
    process.env.NODE_ENV = 'test'
    process.env.ENABLE_AUTH_TEST_HELPERS = '1'
    const res = await requestJson('POST', '/api/test/oauth/github/callback', {
      providerUserId: 'gh-e2e',
      providerLogin: 'gh-e2e',
      email: 'gh-e2e@example.com',
      displayName: 'GH E2E',
    })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ ok: true, provider: 'github', mode: 'onboarding' })
    expect(res.headers['Set-Cookie']).toContain('oa_onboarding=')
  })

  it('test oauth helper logs in an existing linked user when identity already exists', async () => {
    process.env.NODE_ENV = 'test'
    process.env.ENABLE_AUTH_TEST_HELPERS = '1'
    const user = await createLocalUserForTests('oauthlogin', 'password123', 'OAuth Login')
    linkIdentity(user.id, {
      provider: 'google',
      providerUserId: 'google-existing',
      providerLogin: 'google-existing',
      email: 'existing@example.com',
      emailVerified: true,
      displayName: 'Existing Google',
    })

    const res = await requestJson('POST', '/api/test/oauth/google/callback', {
      providerUserId: 'google-existing',
      providerLogin: 'google-existing',
      email: 'existing@example.com',
      displayName: 'Existing Google',
    })

    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ ok: true, provider: 'google', mode: 'login' })
    expect(res.headers['Set-Cookie']).toContain('oa_session=')
    expect(validateSession(String(res.headers['Set-Cookie']).match(/oa_session=([^;]+)/)?.[1] ?? '')).toMatchObject({
      username: 'oauthlogin',
    })
  })

  it('test oauth helper remains unavailable in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ENABLE_AUTH_TEST_HELPERS = '1'
    const res = await requestJson('POST', '/api/test/oauth/github/callback', { providerUserId: 'x' })
    expect(res.status).toBe(404)
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
    const currentToken = createSession(currentUser.id)
    const res = await requestJson(
      'GET',
      `/api/auth/oauth/github/callback?code=ok&state=${state}`,
      undefined,
      { Cookie: `${oauthCookieForState(state)}; oa_session=${currentToken}` },
    )

    expect(res.status).toBe(302)
    expect(res.headers.Location).toContain('page=settings')
    expect(res.headers.Location).toContain('authError=oauth_identity_taken')
    expect(res.headers['Set-Cookie']).toContain(`${OAUTH_STATE_COOKIE}=;`)
    expect(res.headers['Set-Cookie']).not.toContain('oa_session=')
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM sessions').get()).toMatchObject({ count: 1 })
  })

  it('rejects link callback without a matching current session cookie', async () => {
    const stateUser = await createLocalUserForTests('stateuser', 'password123', 'State User')
    const otherUser = await createLocalUserForTests('otheruser', 'password123', 'Other User')
    const profile = {
      provider: 'github' as const,
      providerUserId: 'gh-session-required',
      providerLogin: 'session-required-gh',
      emailVerified: true,
    }
    const state = createOAuthState({ provider: 'github', intent: 'link', userId: stateUser.id })

    const noCookie = await requestJson(
      'GET',
      `/api/auth/oauth/github/callback?code=ok&state=${state}`,
      undefined,
      { Cookie: oauthCookieForState(state) },
    )
    expect(noCookie.status).toBe(302)
    expect(noCookie.headers.Location).toContain('page=settings')
    expect(noCookie.headers.Location).toContain('authError=not_authenticated')
    expect(findIdentity('github', 'gh-session-required')).toBeNull()

    const secondState = createOAuthState({ provider: 'github', intent: 'link', userId: stateUser.id })
    const otherToken = createSession(otherUser.id)
    const mismatch = await requestJson(
      'GET',
      `/api/auth/oauth/github/callback?code=ok&state=${secondState}`,
      undefined,
      { Cookie: `${oauthCookieForState(secondState)}; oa_session=${otherToken}` },
    )
    expect(mismatch.status).toBe(302)
    expect(mismatch.headers.Location).toContain('authError=not_authenticated')
    expect(findIdentity('github', 'gh-session-required')).toBeNull()
  })

  it('binds OAuth callback state to the initiating browser cookie', async () => {
    const user = await createLocalUserForTests('statebound', 'password123', 'State Bound')
    const profile = {
      provider: 'github' as const,
      providerUserId: 'gh-statebound',
      providerLogin: 'statebound-gh',
      emailVerified: true,
    }
    linkIdentity(user.id, profile)
    vi.mocked(exchangeOAuthCode).mockResolvedValueOnce(profile)

    const start = await requestJson('GET', '/api/auth/oauth/github/start')
    const state = new URL(String(start.headers.Location)).searchParams.get('state') ?? ''

    const withoutCookie = await requestJson('GET', `/api/auth/oauth/github/callback?code=ok&state=${state}`)
    expect(withoutCookie.status).toBe(302)
    expect(withoutCookie.headers.Location).toContain('authError=oauth_state_invalid')
    expect(withoutCookie.headers['Set-Cookie']).toContain(`${OAUTH_STATE_COOKIE}=;`)
    expect(withoutCookie.headers['Set-Cookie']).not.toContain('oa_session=')

    const withCookie = await requestJson(
      'GET',
      `/api/auth/oauth/github/callback?code=ok&state=${state}`,
      undefined,
      { Cookie: startOAuthCookie(start) },
    )
    expect(withCookie.status).toBe(302)
    expect(withCookie.headers['Set-Cookie']).toContain('oa_session=')
    expect(withCookie.headers['Set-Cookie']).toContain(`${OAUTH_STATE_COOKIE}=;`)
  })

  it('preserves safe returnTo through OAuth onboarding completion', async () => {
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example/open-agricola/'
    const profile = {
      provider: 'github' as const,
      providerUserId: 'gh-onboarding-return',
      providerLogin: 'onboarding-return-gh',
      emailVerified: true,
      displayName: 'Onboarding Return',
    }
    vi.mocked(exchangeOAuthCode).mockResolvedValueOnce(profile)

    const start = await requestJson('GET', '/api/auth/oauth/github/start?returnTo=%2Fopen-agricola%2F%3Fpage%3Dworkshop')
    const state = new URL(String(start.headers.Location)).searchParams.get('state') ?? ''
    const callback = await requestJson(
      'GET',
      `/api/auth/oauth/github/callback?code=ok&state=${state}`,
      undefined,
      { Cookie: startOAuthCookie(start) },
    )
    expect(callback.status).toBe(302)
    expect(callback.headers.Location).toBe('https://frontend.example/open-agricola/?page=onboarding')
    const onboardingCookie = cookiePairFromSetCookie(callback.headers['Set-Cookie'], 'oa_onboarding')

    const complete = await requestJson(
      'POST',
      '/api/auth/onboarding/complete',
      {
        username: 'returnuser',
        displayName: 'Return User',
        password: 'password123',
        confirmPassword: 'password123',
      },
      { Cookie: onboardingCookie },
    )

    expect(complete.status).toBe(200)
    expect(complete.json).toMatchObject({ ok: true, returnTo: '/?page=workshop' })
    expect(complete.headers['Set-Cookie']).toContain('oa_session=')
  })

  it('redirects OAuth app destinations to PUBLIC_APP_ORIGIN while preserving safe returnTo', async () => {
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example/open-agricola/'
    const user = await createLocalUserForTests('frontredir', 'password123', 'Front Redir')
    const profile = {
      provider: 'github' as const,
      providerUserId: 'gh-frontredir',
      providerLogin: 'frontredir-gh',
      emailVerified: true,
    }
    linkIdentity(user.id, profile)
    vi.mocked(exchangeOAuthCode).mockResolvedValueOnce(profile)

    const start = await requestJson('GET', '/api/auth/oauth/github/start?returnTo=%2F%3Fpage%3Dsettings')
    const state = new URL(String(start.headers.Location)).searchParams.get('state')
    const res = await requestJson(
      'GET',
      `/api/auth/oauth/github/callback?code=ok&state=${state}`,
      undefined,
      { Cookie: startOAuthCookie(start) },
    )

    expect(res.status).toBe(302)
    expect(res.headers.Location).toBe('https://frontend.example/open-agricola/?page=settings')
    expect(res.headers['Set-Cookie']).toContain('oa_session=')
    expect(res.headers['Set-Cookie']).toContain(`${OAUTH_STATE_COOKIE}=;`)
  })

  it('does not duplicate PUBLIC_APP_ORIGIN path base when OAuth returnTo already includes it', async () => {
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example/open-agricola/'
    const user = await createLocalUserForTests('baseredir', 'password123', 'Base Redir')
    const profile = {
      provider: 'github' as const,
      providerUserId: 'gh-baseredir',
      providerLogin: 'baseredir-gh',
      emailVerified: true,
    }
    linkIdentity(user.id, profile)
    vi.mocked(exchangeOAuthCode).mockResolvedValueOnce(profile)

    const start = await requestJson('GET', '/api/auth/oauth/github/start?returnTo=%2Fopen-agricola%2F%3Fpage%3Dworkshop')
    const state = new URL(String(start.headers.Location)).searchParams.get('state')
    const res = await requestJson(
      'GET',
      `/api/auth/oauth/github/callback?code=ok&state=${state}`,
      undefined,
      { Cookie: startOAuthCookie(start) },
    )

    expect(res.status).toBe(302)
    expect(res.headers.Location).toBe('https://frontend.example/open-agricola/?page=workshop')
  })

  it('does not duplicate PUBLIC_APP_ORIGIN path base when OAuth returnTo omits the trailing slash before query', async () => {
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example/open-agricola/'
    const user = await createLocalUserForTests('querybase', 'password123', 'Query Base')
    const profile = {
      provider: 'github' as const,
      providerUserId: 'gh-querybase',
      providerLogin: 'querybase-gh',
      emailVerified: true,
    }
    linkIdentity(user.id, profile)
    vi.mocked(exchangeOAuthCode).mockResolvedValueOnce(profile)

    const start = await requestJson('GET', '/api/auth/oauth/github/start?returnTo=%2Fopen-agricola%3Fpage%3Dworkshop')
    const state = new URL(String(start.headers.Location)).searchParams.get('state')
    const res = await requestJson(
      'GET',
      `/api/auth/oauth/github/callback?code=ok&state=${state}`,
      undefined,
      { Cookie: startOAuthCookie(start) },
    )

    expect(res.status).toBe(302)
    expect(res.headers.Location).toBe('https://frontend.example/open-agricola/?page=workshop')
  })

  it('returns stable auth error codes from representative cookie auth routes', async () => {
    const missingLogin = await requestJson('POST', '/api/auth/login', {})
    expect(missingLogin.status).toBe(400)
    expect(missingLogin.json).toMatchObject({ ok: false, code: 'missing_fields' })

    const unauthMe = await requestJson('GET', '/api/auth/me')
    expect(unauthMe.status).toBe(401)
    expect(unauthMe.json).toMatchObject({ ok: false, code: 'not_authenticated' })

    const unauthProfile = await requestJson('PATCH', '/api/auth/profile', { displayName: 'Name' })
    expect(unauthProfile.status).toBe(401)
    expect(unauthProfile.json).toMatchObject({ ok: false, code: 'not_authenticated' })

    const user = await createLocalUserForTests('pwuser', 'password123', 'Pw User')
    const token = createSession(user.id)
    const missingPasswordFields = await requestJson(
      'POST',
      '/api/auth/change-password',
      {},
      { Cookie: `oa_session=${token}` },
    )
    expect(missingPasswordFields.status).toBe(400)
    expect(missingPasswordFields.json).toMatchObject({ ok: false, code: 'missing_fields' })
  })

  it('ignores external oauth returnTo redirects', async () => {
    const user = await createLocalUserForTests('oauthuser', 'password123', 'OAuth User')
    const profile = {
      provider: 'github' as const,
      providerUserId: 'gh-oauthuser',
      providerLogin: 'oauth-gh',
      emailVerified: true,
    }
    linkIdentity(user.id, profile)

    for (const returnTo of ['https://evil.test', '//evil.test', '\\\\evil']) {
      vi.mocked(exchangeOAuthCode).mockResolvedValueOnce(profile)
      const start = await requestJson('GET', `/api/auth/oauth/github/start?returnTo=${encodeURIComponent(returnTo)}`)
      const state = new URL(String(start.headers.Location)).searchParams.get('state')
      const res = await requestJson(
        'GET',
        `/api/auth/oauth/github/callback?code=ok&state=${state}`,
        undefined,
        { Cookie: startOAuthCookie(start) },
      )

      expect(res.status).toBe(302)
      expect(res.headers.Location).toBe('/')
    }
  })

  it('allows PATCH in CORS preflight methods', async () => {
    const res = await requestJson('OPTIONS', '/api/auth/profile')
    expect(res.status).toBe(204)
    expect(res.headers['Access-Control-Allow-Methods']).toContain('PATCH')
  })
})
