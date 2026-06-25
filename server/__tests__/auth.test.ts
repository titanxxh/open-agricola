import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  changePassword,
  createLocalUserForTests,
  createSession,
  deleteAccount,
  login,
  logout,
  logoutAll,
  register,
  registerPasswordUser,
  validateSession,
  verifyEmailToken,
} from '../auth.ts'
import {
  clearOnboardingCookie,
  clearSessionCookie,
  ONBOARDING_COOKIE,
  readCookie,
  serializeOnboardingCookie,
  serializeSessionCookie,
  SESSION_COOKIE,
} from '../auth-cookies.ts'
import { checkRateLimit, resetRateLimitsForTests } from '../rate-limit.ts'
import { getDb } from '../db.ts'

// Use an in-memory database for tests
vi.mock('../db.ts', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      email TEXT COLLATE NOCASE,
      email_verified_at INTEGER,
      email_verification_sent_at INTEGER,
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
    CREATE TABLE email_verification_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id);
    CREATE INDEX idx_email_verification_expires ON email_verification_tokens(expires_at);
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
      invite_code_hash TEXT,
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
      invite_code_hash TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE reserved_usernames (
      username TEXT PRIMARY KEY COLLATE NOCASE,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL
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

import { vi } from 'vitest'

describe('auth', () => {
  beforeEach(() => {
    delete process.env.ADMIN_USERS
    delete process.env.ACCOUNT_REGISTRATION_POLICY
    void verifyEmailToken
    const db = getDb()
    db.exec(`
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
      DELETE FROM oauth_onboarding_tickets;
      DELETE FROM oauth_states;
      DELETE FROM email_verification_tokens;
      DELETE FROM reserved_usernames;
      DELETE FROM auth_identities;
      DELETE FROM sessions;
      DELETE FROM users;
    `)
  })

  it('test schema includes invite_code_hash columns for oauth temp tables', () => {
    const db = getDb()
    const stateColumns = db.prepare('PRAGMA table_info(oauth_states)').all() as Array<{ name: string }>
    const ticketColumns = db.prepare('PRAGMA table_info(oauth_onboarding_tickets)').all() as Array<{ name: string }>

    expect(stateColumns.map(column => column.name)).toContain('invite_code_hash')
    expect(ticketColumns.map(column => column.name)).toContain('invite_code_hash')
  })

  describe('register', () => {
    it('direct register is disabled with a stable code', async () => {
      const result = await register('newuser', 'password123', 'New User')
      expect(result).toEqual({
        ok: false,
        code: 'oauth_registration_required',
        error: 'Registration requires GitHub or Google',
      })
    })

    it('password registration creates an unverified user without a session', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'

      const result = await registerPasswordUser({
        username: 'emailuser',
        email: 'EmailUser@Example.COM',
        password: 'password123',
        confirmPassword: 'password123',
        displayName: 'Email User',
      })

      expect(result).toMatchObject({ ok: true, status: 'verification_required' })
      if (!result.ok) return

      const row = getDb().prepare(`
        SELECT username, email, email_verified_at
        FROM users
        WHERE id = ?
      `).get(result.userId) as { username: string; email: string; email_verified_at: number | null }

      expect(row.username).toBe('emailuser')
      expect(row.email).toBe('emailuser@example.com')
      expect(row.email_verified_at).toBeNull()
      expect(validateSession('')).toBeNull()
    })

    it('rejects duplicate normalized emails', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      await registerPasswordUser({
        username: 'emailone',
        email: 'same@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })

      const result = await registerPasswordUser({
        username: 'emailtwo',
        email: 'SAME@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })

      expect(result).toMatchObject({ ok: false, code: 'email_taken' })
    })
  })

  describe('login', () => {
    beforeEach(async () => {
      await createLocalUserForTests('logintest', 'correctpass', 'Login Test')
    })

    it('succeeds with correct credentials', async () => {
      const result = await login('logintest', 'correctpass')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.user.username).toBe('logintest')
      expect(result.token).toBeTruthy()
    })

    it('includes admin status for password login responses', async () => {
      process.env.ADMIN_USERS = 'logintest'
      const result = await login('logintest', 'correctpass')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.user).toMatchObject({ username: 'logintest', isAdmin: true })
    })

    it('rejects wrong password', async () => {
      const result = await login('logintest', 'wrongpass')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toMatch(/invalid/i)
    })

    it('rejects unknown username', async () => {
      const result = await login('nobody', 'anypass')
      expect(result.ok).toBe(false)
    })

    it('is case-insensitive for username', async () => {
      const result = await login('LOGINTEST', 'correctpass')
      expect(result.ok).toBe(true)
    })

    it('password login still works for legacy local accounts', async () => {
      const created = await createLocalUserForTests('legacy', 'password123', 'Legacy User')
      expect(created.username).toBe('legacy')
      const result = await login('legacy', 'password123')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.token).toBeTruthy()
      expect(result.user.username).toBe('legacy')
    })

    it('blocks password login before email verification', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      await registerPasswordUser({
        username: 'pendinglogin',
        email: 'pending@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })

      const result = await login('pendinglogin', 'password123')

      expect(result).toMatchObject({ ok: false, code: 'email_not_verified' })
    })
  })

  describe('local users', () => {
    it('requires eight character passwords for local users and password changes', async () => {
      await expect(createLocalUserForTests('weakpass', '1234567', 'Weak')).rejects.toThrow(/Password must be at least 8 characters/)

      const user = await createLocalUserForTests('changepass', 'password123', 'Change Pass')
      await expect(changePassword(user.id, 'password123', '1234567')).resolves.toBe('Password must be at least 8 characters')
    })
  })

  describe('validateSession', () => {
    it('returns user for valid token', async () => {
      const created = await createLocalUserForTests('sessuser', 'password123')
      const token = createSession(created.id)
      const user = validateSession(token)
      expect(user).not.toBeNull()
      expect(user?.username).toBe('sessuser')
    })

    it('returns null for invalid token', () => {
      const user = validateSession('not-a-real-token')
      expect(user).toBeNull()
    })

    it('returns null for empty token', () => {
      expect(validateSession('')).toBeNull()
    })
  })

  describe('logout', () => {
    it('invalidates the session', async () => {
      const created = await createLocalUserForTests('logoutuser', 'password123')
      const token = createSession(created.id)
      logout(token)
      const user = validateSession(token)
      expect(user).toBeNull()
    })

    it('logoutAll invalidates every session for a user', async () => {
      const user = await createLocalUserForTests('multi', 'password123', 'Multi')
      const one = createSession(user.id)
      const two = createSession(user.id)
      expect(validateSession(one)?.username).toBe('multi')
      expect(validateSession(two)?.username).toBe('multi')
      logoutAll(user.id)
      expect(validateSession(one)).toBeNull()
      expect(validateSession(two)).toBeNull()
    })
  })

  describe('deleteAccount', () => {
    const count = (sql: string, ...params: unknown[]): number =>
      (getDb().prepare(sql).get(...params) as { n: number }).n

    it('removes account-owned data and finishes persisted rooms involving the user', async () => {
      const db = getDb()
      const user = await createLocalUserForTests('deleteme', 'password123', 'Delete Me')
      const other = await createLocalUserForTests('otheruser', 'password123', 'Other User')
      const token = createSession(user.id)
      const now = Date.now()

      db.prepare(`
        INSERT INTO auth_identities (
          id, user_id, provider, provider_user_id, provider_login, provider_email,
          provider_email_verified, display_name, avatar_url, linked_at
        ) VALUES (?, ?, 'github', 'gh-delete', 'deleteme', 'delete@example.test', 1, 'Delete Me', NULL, ?)
      `).run('identity-delete', user.id, now)
      db.prepare('INSERT INTO oauth_states (state_hash, provider, intent, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('state-delete', 'github', 'link', user.id, now + 1000, now)

      db.prepare(`
        INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at)
        VALUES (?, ?, ?, 2, 'playing', 1, '[]', ?, ?)
      `).run('owned-room', user.id, '{"private":"name"}', now, now)
      db.prepare(`
        INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at)
        VALUES (?, ?, ?, 2, 'playing', 1, '[]', ?, ?)
      `).run('joined-room', other.id, '{"private":"name"}', now, now)
      db.prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)')
        .run('owned-room', user.id, 0, now)
      db.prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)')
        .run('joined-room', user.id, 1, now)
      db.prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)')
        .run('joined-room', other.id, 0, now)

      db.prepare(`
        INSERT INTO workshop_cards (
          id, author_id, card_id, card_type, name, description, card_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'minor', ?, '', '{}', 'draft', ?, ?)
      `).run('owned-card', user.id, 'CUSTOM_DELETE', 'Delete Card', now, now)
      db.prepare(`
        INSERT INTO workshop_cards (
          id, author_id, card_id, card_type, name, description, card_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'minor', ?, '', '{}', 'draft', ?, ?)
      `).run('other-card', other.id, 'CUSTOM_OTHER', 'Other Card', now, now)
      db.prepare('INSERT INTO workshop_card_versions (id, card_id, card_json, version_number, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('owned-version', 'owned-card', '{}', 1, user.id, now)
      db.prepare('INSERT INTO workshop_card_versions (id, card_id, card_json, version_number, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('other-card-user-version', 'other-card', '{}', 1, user.id, now)
      db.prepare('INSERT INTO card_likes (user_id, card_id, created_at) VALUES (?, ?, ?)')
        .run(user.id, 'other-card', now)
      db.prepare('INSERT INTO card_likes (user_id, card_id, created_at) VALUES (?, ?, ?)')
        .run(other.id, 'owned-card', now)
      db.prepare('INSERT INTO card_comments (id, card_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('user-comment', 'other-card', user.id, 'delete me', now)
      db.prepare('INSERT INTO card_comments (id, card_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('owned-card-comment', 'owned-card', other.id, 'deleted with card', now)
      db.prepare('INSERT INTO sandbox_cards (user_id, workshop_card_id, added_at) VALUES (?, ?, ?)')
        .run(user.id, 'other-card', now)
      db.prepare('INSERT INTO sandbox_cards (user_id, workshop_card_id, added_at) VALUES (?, ?, ?)')
        .run(other.id, 'owned-card', now)
      db.prepare('INSERT INTO sandbox_settings (user_id, player_count, deck_ids_json, updated_at) VALUES (?, 2, ?, ?)')
        .run(user.id, '["A"]', now)
      db.prepare('INSERT INTO github_propose_rate_limit (user_id, last_propose_at) VALUES (?, ?)')
        .run(user.id, now)
      db.prepare('INSERT INTO github_propose_audit (id, user_id, workshop_card_id, action, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('audit-user', user.id, 'other-card', 'propose', now)
      db.prepare('INSERT INTO github_propose_audit (id, user_id, workshop_card_id, action, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('audit-owned-card', other.id, 'owned-card', 'propose', now)

      expect(deleteAccount(user.id)).toEqual({ ok: true })

      expect(validateSession(token)).toBeNull()
      expect(count('SELECT COUNT(*) AS n FROM users WHERE id = ?', user.id)).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM users WHERE id = ?', other.id)).toBe(1)
      expect(count('SELECT COUNT(*) AS n FROM auth_identities WHERE user_id = ?', user.id)).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM oauth_states WHERE user_id = ?', user.id)).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM room_players WHERE user_id = ?', user.id)).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM workshop_cards WHERE id = ?', 'owned-card')).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM workshop_cards WHERE id = ?', 'other-card')).toBe(1)
      expect(count('SELECT COUNT(*) AS n FROM workshop_card_versions WHERE created_by = ?', user.id)).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM card_likes WHERE user_id = ? OR card_id = ?', user.id, 'owned-card')).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM card_comments WHERE author_id = ? OR card_id = ?', user.id, 'owned-card')).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM sandbox_cards WHERE user_id = ? OR workshop_card_id = ?', user.id, 'owned-card')).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM sandbox_settings WHERE user_id = ?', user.id)).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM github_propose_rate_limit WHERE user_id = ?', user.id)).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM github_propose_audit WHERE user_id = ? OR workshop_card_id = ?', user.id, 'owned-card')).toBe(0)

      const rooms = db.prepare('SELECT id, created_by, state_json, status FROM rooms ORDER BY id').all() as Array<{
        id: string
        created_by: string | null
        state_json: string | null
        status: string
      }>
      expect(rooms).toEqual([
        { id: 'joined-room', created_by: other.id, state_json: null, status: 'finished' },
        { id: 'owned-room', created_by: null, state_json: null, status: 'finished' },
      ])
    })

    it('reserves deleted admin usernames after removing the user row', async () => {
      process.env.ADMIN_USERS = 'deleteadmin'
      const user = await createLocalUserForTests('deleteadmin', 'password123', 'Delete Admin')

      expect(deleteAccount(user.id)).toEqual({ ok: true })

      expect(count('SELECT COUNT(*) AS n FROM users WHERE username = ?', 'deleteadmin')).toBe(0)
      expect(count('SELECT COUNT(*) AS n FROM reserved_usernames WHERE username = ?', 'deleteadmin')).toBe(1)
    })
  })

  describe('cookies', () => {
    it('serializes and reads auth cookies', () => {
      const session = serializeSessionCookie('tok en')
      const onboarding = serializeOnboardingCookie('ticket=value')
      expect(session).toContain(`${SESSION_COOKIE}=tok%20en`)
      expect(session).toContain('HttpOnly')
      expect(onboarding).toContain(`${ONBOARDING_COOKIE}=ticket%3Dvalue`)
      expect(readCookie(`${session}; ${onboarding}`, SESSION_COOKIE)).toBe('tok en')
      expect(clearSessionCookie()).toContain(`${SESSION_COOKIE}=;`)
      expect(clearOnboardingCookie()).toContain(`${ONBOARDING_COOKIE}=;`)
    })

    it('treats malformed cookie values as missing', () => {
      expect(readCookie(`${SESSION_COOKIE}=%`, SESSION_COOKIE)).toBe('')
    })
  })

  describe('rate limit', () => {
    beforeEach(() => {
      resetRateLimitsForTests()
    })

    it('rejects requests over the configured window limit', () => {
      expect(checkRateLimit('auth:test', { windowMs: 1000, max: 2 })).toBe(true)
      expect(checkRateLimit('auth:test', { windowMs: 1000, max: 2 })).toBe(true)
      expect(checkRateLimit('auth:test', { windowMs: 1000, max: 2 })).toBe(false)
    })
  })
})
