import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('test schema includes invite_code_hash columns for oauth temp tables', () => {
    const stateColumns = getDb().prepare('PRAGMA table_info(oauth_states)').all() as Array<{ name: string }>
    const ticketColumns = getDb().prepare('PRAGMA table_info(oauth_onboarding_tickets)').all() as Array<{ name: string }>

    expect(stateColumns.map(column => column.name)).toContain('invite_code_hash')
    expect(ticketColumns.map(column => column.name)).toContain('invite_code_hash')
  })

  it('creates and consumes oauth state exactly once', () => {
    const raw = createOAuthState({ provider: 'github', intent: 'register', returnTo: '/?page=lobby' })
    const consumed = consumeOAuthState(raw)
    expect(consumed).toMatchObject({ provider: 'github', intent: 'register', returnTo: '/?page=lobby' })
    expect(consumeOAuthState(raw)).toBeNull()
  })

  it('prunes expired and used temporary oauth rows before creating new rows', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const usedState = createOAuthState({ provider: 'github', intent: 'register' })
    consumeOAuthState(usedState)
    createOnboardingTicket({
      provider: 'google',
      providerUserId: 'g-expired',
      emailVerified: false,
    })

    vi.setSystemTime(new Date('2026-01-01T00:16:00Z'))
    createOAuthState({ provider: 'google', intent: 'login' })

    const row = getDb().prepare(`
      SELECT
        (SELECT COUNT(*) FROM oauth_states) AS states,
        (SELECT COUNT(*) FROM oauth_onboarding_tickets) AS tickets
    `).get() as { states: number; tickets: number }
    expect(row).toEqual({ states: 1, tickets: 0 })
  })

  it('round-trips inviteCodeHash through oauth state and onboarding ticket', () => {
    const raw = createOAuthState({
      provider: 'github',
      intent: 'register',
      returnTo: '/?page=login',
      inviteCodeHash: 'hashed-invite',
    })

    const state = consumeOAuthState(raw)
    expect(state).toMatchObject({
      provider: 'github',
      intent: 'register',
      returnTo: '/?page=login',
      inviteCodeHash: 'hashed-invite',
    })

    const ticket = createOnboardingTicket({
      provider: 'github',
      providerUserId: 'gh-hash-roundtrip',
      emailVerified: true,
    }, '/?page=onboarding', state?.inviteCodeHash)

    expect(consumeOnboardingTicket(ticket)).toMatchObject({
      provider: 'github',
      providerUserId: 'gh-hash-roundtrip',
      returnTo: '/?page=onboarding',
      inviteCodeHash: 'hashed-invite',
    })
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
    }, '/?page=workshop')
    expect(consumeOnboardingTicket(ticket)).toMatchObject({
      provider: 'google',
      providerUserId: 'g-1',
      returnTo: '/?page=workshop',
    })
    expect(consumeOnboardingTicket(ticket)).toBeNull()
  })
})
