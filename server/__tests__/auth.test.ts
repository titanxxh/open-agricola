import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  changePassword,
  createLocalUserForTests,
  createSession,
  login,
  logout,
  logoutAll,
  register,
  validateSession,
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

import { vi } from 'vitest'

describe('auth', () => {
  beforeEach(() => {
    const db = getDb()
    db.exec(`
      DELETE FROM oauth_onboarding_tickets;
      DELETE FROM oauth_states;
      DELETE FROM auth_identities;
      DELETE FROM sessions;
      DELETE FROM users;
    `)
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
