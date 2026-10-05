import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('../../db.ts', async () => {
  const { createTestDatabase } = await import('../../__tests__/_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})
afterAll(async () => { await getDb().close() })

describe('oauth store', () => {
  beforeEach(async () => {
    ;(await getDb().exec(`
      DELETE FROM oauth_onboarding_tickets;
      DELETE FROM oauth_states;
      DELETE FROM auth_identities;
      DELETE FROM sessions;
      DELETE FROM users;
    `))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates and consumes oauth state exactly once', async () => {
    const raw = (await createOAuthState({ provider: 'github', intent: 'register', returnTo: '/?page=lobby' }))
    const consumed = (await consumeOAuthState(raw))
    expect(consumed).toMatchObject({ provider: 'github', intent: 'register', returnTo: '/?page=lobby' })
    expect((await consumeOAuthState(raw))).toBeNull()
  })

  it('prunes expired and used temporary oauth rows before creating new rows', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const usedState = (await createOAuthState({ provider: 'github', intent: 'register' }))
    ;(await consumeOAuthState(usedState))
    ;(await createOnboardingTicket({
      provider: 'google',
      providerUserId: 'g-expired',
      emailVerified: false,
    }))

    vi.setSystemTime(new Date('2026-01-01T00:16:00Z'))
    ;(await createOAuthState({ provider: 'google', intent: 'login' }))

    const row = (await getDb().prepare(`
      SELECT
        (SELECT COUNT(*) FROM oauth_states) AS states,
        (SELECT COUNT(*) FROM oauth_onboarding_tickets) AS tickets
    `).get()) as { states: number; tickets: number }
    expect(row).toEqual({ states: 1, tickets: 0 })
  })

  it('round-trips inviteCodeHash through oauth state and onboarding ticket', async () => {
    const raw = (await createOAuthState({
      provider: 'github',
      intent: 'register',
      returnTo: '/?page=login',
      inviteCodeHash: 'hashed-invite',
    }))

    const state = (await consumeOAuthState(raw))
    expect(state).toMatchObject({
      provider: 'github',
      intent: 'register',
      returnTo: '/?page=login',
      inviteCodeHash: 'hashed-invite',
    })

    const ticket = (await createOnboardingTicket({
      provider: 'github',
      providerUserId: 'gh-hash-roundtrip',
      emailVerified: true,
    }, '/?page=onboarding', state?.inviteCodeHash))

    expect((await consumeOnboardingTicket(ticket))).toMatchObject({
      provider: 'github',
      providerUserId: 'gh-hash-roundtrip',
      returnTo: '/?page=onboarding',
      inviteCodeHash: 'hashed-invite',
    })
  })

  it('links one provider identity to one user', async () => {
    const user = await createLocalUserForTests('linked', 'password123', 'Linked')
    ;(await linkIdentity(user.id, {
      provider: 'github',
      providerUserId: 'gh-1',
      providerLogin: 'linked-gh',
      email: 'linked@example.com',
      emailVerified: true,
      displayName: 'Linked GH',
    }))
    expect((await findIdentity('github', 'gh-1'))).toEqual({ userId: user.id })
    ;(await expect(linkIdentity(user.id, {
      provider: 'github',
      providerUserId: 'gh-2',
      emailVerified: false,
    })).rejects.toThrow(/already linked/))
  })

  it('creates and consumes onboarding tickets exactly once', async () => {
    const ticket = (await createOnboardingTicket({
      provider: 'google',
      providerUserId: 'g-1',
      providerLogin: 'person',
      email: 'person@example.com',
      emailVerified: true,
      displayName: 'Person',
    }, '/?page=workshop'))
    expect((await consumeOnboardingTicket(ticket))).toMatchObject({
      provider: 'google',
      providerUserId: 'g-1',
      returnTo: '/?page=workshop',
    })
    expect((await consumeOnboardingTicket(ticket))).toBeNull()
  })
})
