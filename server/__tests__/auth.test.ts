import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { register, login, logout, validateSession } from '../auth.ts'

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
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  return { getDb: () => db, cleanExpiredSessions: () => {} }
})

import { vi } from 'vitest'

describe('auth', () => {
  describe('register', () => {
    it('creates a user and returns a token', async () => {
      const result = await register('testuser', 'password123')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.user.username).toBe('testuser')
      expect(result.token).toBeTruthy()
    })

    it('rejects duplicate username', async () => {
      await register('dupeuser', 'pass1234')
      const result = await register('dupeuser', 'pass5678')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toMatch(/taken/i)
    })

    it('rejects short username', async () => {
      const result = await register('x', 'password123')
      expect(result.ok).toBe(false)
    })

    it('rejects short password', async () => {
      const result = await register('validuser2', '123')
      expect(result.ok).toBe(false)
    })

    it('uses username as displayName when not provided', async () => {
      const result = await register('nameless', 'password123')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.user.displayName).toBe('nameless')
    })

    it('accepts custom displayName', async () => {
      const result = await register('myuser', 'password123', 'My Name')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.user.displayName).toBe('My Name')
    })
  })

  describe('login', () => {
    beforeEach(async () => {
      await register('logintest', 'correctpass', 'Login Test')
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
  })

  describe('validateSession', () => {
    it('returns user for valid token', async () => {
      const reg = await register('sessuser', 'password123')
      if (!reg.ok) return
      const user = validateSession(reg.token)
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
      const reg = await register('logoutuser', 'password123')
      if (!reg.ok) return
      logout(reg.token)
      const user = validateSession(reg.token)
      expect(user).toBeNull()
    })
  })
})
