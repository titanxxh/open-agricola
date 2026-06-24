import { beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createLocalUserForTests } from '../../auth.ts'
import { getDb } from '../../db.ts'
import {
  consumeOAuthState,
  consumeOnboardingTicket,
  createOAuthState,
  createOnboardingTicket,
  findIdentity,
  linkIdentity,
} from '../store.ts'

vi.mock('../../db.ts', () => {
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

describe('oauth store', () => {
  beforeEach(() => {
    getDb().exec(`
      DELETE FROM oauth_onboarding_tickets;
      DELETE FROM oauth_states;
      DELETE FROM auth_identities;
      DELETE FROM sessions;
      DELETE FROM users;
    `)
  })

  it('creates and consumes oauth state exactly once', () => {
    const raw = createOAuthState({ provider: 'github', intent: 'register', returnTo: '/?page=lobby' })
    const consumed = consumeOAuthState(raw)
    expect(consumed).toMatchObject({ provider: 'github', intent: 'register', returnTo: '/?page=lobby' })
    expect(consumeOAuthState(raw)).toBeNull()
  })

  it('links one provider identity to one user', async () => {
    const user = await createLocalUserForTests('linked', 'password123', 'Linked')
    linkIdentity(user.id, {
      provider: 'github',
      providerUserId: 'gh-1',
      providerLogin: 'linked-gh',
      email: 'linked@example.com',
      emailVerified: true,
      displayName: 'Linked GH',
    })
    expect(findIdentity('github', 'gh-1')).toEqual({ userId: user.id })
    expect(() => linkIdentity(user.id, {
      provider: 'github',
      providerUserId: 'gh-2',
      emailVerified: false,
    })).toThrow(/already linked/)
  })

  it('creates and consumes onboarding tickets exactly once', () => {
    const ticket = createOnboardingTicket({
      provider: 'google',
      providerUserId: 'g-1',
      providerLogin: 'person',
      email: 'person@example.com',
      emailVerified: true,
      displayName: 'Person',
    })
    expect(consumeOnboardingTicket(ticket)).toMatchObject({ provider: 'google', providerUserId: 'g-1' })
    expect(consumeOnboardingTicket(ticket)).toBeNull()
  })
})
