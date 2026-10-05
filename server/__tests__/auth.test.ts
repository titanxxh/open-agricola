import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import * as emailModule from '../email.ts'
import {
  changePassword,
  createEmailVerificationToken,
  createLocalUserForTests,
  createSession,
  deleteAccount,
  login,
  logout,
  logoutAll,
  register,
  registerPasswordUser,
  resendVerificationEmail,
  sendVerificationEmail,
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
import { createInvite } from '../invites.ts'

// Exercise the native schema and transaction boundaries on PostgreSQL.
vi.mock('../db.ts', async () => {
  const { createTestDatabase } = await import('./_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})
afterAll(async () => { await getDb().close() })

import { vi } from 'vitest'

const originalNodeEnv = process.env.NODE_ENV

describe('auth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    delete process.env.PUBLIC_API_BASE
  })

  beforeEach(async () => {
    delete process.env.ADMIN_USERS
    delete process.env.ACCOUNT_REGISTRATION_POLICY
    void verifyEmailToken
    const db = getDb()
    ;(await db.exec(`
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
      DELETE FROM account_invites;
      DELETE FROM reserved_usernames;
      DELETE FROM auth_identities;
      DELETE FROM sessions;
      DELETE FROM users;
    `))
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

      const row = (await getDb().prepare(`
        SELECT username, email, email_verified_at
        FROM users
        WHERE id = ?
      `).get(result.userId)) as { username: string; email: string; email_verified_at: number | null }

      expect(row.username).toBe('emailuser')
      expect(row.email).toBe('emailuser@example.com')
      expect(row.email_verified_at).toBeNull()
      expect((await validateSession(''))).toBeNull()
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

    it('requires an invite for invite-only password registration', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'invite_only'

      const result = await registerPasswordUser({
        username: 'needinvite',
        email: 'needinvite@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })

      expect(result).toMatchObject({ ok: false, code: 'invalid_invite' })
      expect((await getDb().prepare('SELECT id FROM users WHERE username = ?').get('needinvite'))).toBeUndefined()
    })

    it('consumes an invite during invite-only password registration', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'invite_only'
      const admin = await createLocalUserForTests('invite_admin', 'password123', 'Invite Admin')
      const invite = (await createInvite(admin.id, { expiresAt: Date.now() + 7 * 86_400_000, maxUses: 1 }))

      const result = await registerPasswordUser({
        username: 'inviteduser',
        email: 'invited@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        inviteCode: invite.code,
      })

      expect(result).toMatchObject({ ok: true, status: 'verification_required' })
      if (!result.ok) return

      const inviteRow = (await getDb().prepare('SELECT used_by, used_at FROM account_invites WHERE id = ?').get(invite.id)) as {
        used_by: string | null
        used_at: number | null
      }
      expect(inviteRow.used_by).toBe(result.userId)
      expect(inviteRow.used_at).toBeGreaterThan(0)
    })

    it('allows password registrations exactly up to a reusable invite limit', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'invite_only'
      const admin = await createLocalUserForTests('multi_admin', 'password123', 'Admin')
      const invite = (await createInvite(admin.id, {
        code: 'PASSWORD-TWO', expiresAt: Date.now() + 86_400_000, maxUses: 2,
      }))

      for (const suffix of ['one', 'two']) {
        const result = await registerPasswordUser({
          username: `invite${suffix}`,
          email: `invite${suffix}@example.com`,
          password: 'password123',
          confirmPassword: 'password123',
          inviteCode: invite.code,
        })
        expect(result.ok).toBe(true)
      }

      const rejected = await registerPasswordUser({
        username: 'invitethree',
        email: 'invitethree@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        inviteCode: invite.code,
      })
      expect(rejected).toMatchObject({ ok: false, code: 'invalid_invite' })
      expect((await getDb().prepare('SELECT use_count FROM account_invites WHERE id = ?').get(invite.id)))
        .toEqual({ use_count: 2 })
    })

    it('returns invalid_invite and rolls back the user when invite consumption fails', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'invite_only'

      const result = await registerPasswordUser({
        username: 'badinvite',
        email: 'badinvite@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        inviteCode: 'oa_invalid',
      })

      expect(result).toMatchObject({ ok: false, code: 'invalid_invite' })
      expect((await getDb().prepare('SELECT id FROM users WHERE username = ?').get('badinvite'))).toBeUndefined()
    })

    it('does not expose duplicate account fields before invite validation succeeds', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      await createLocalUserForTests('existinginviteuser', 'password123', 'Existing Invite User')
      await registerPasswordUser({
        username: 'existinginviteemail',
        email: 'existinginvite@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })
      process.env.ACCOUNT_REGISTRATION_POLICY = 'invite_only'

      const duplicateUsername = await registerPasswordUser({
        username: 'existinginviteuser',
        email: 'unique-invite@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        inviteCode: 'oa_invalid',
      })
      const duplicateEmail = await registerPasswordUser({
        username: 'uniqueinviteuser',
        email: 'existinginvite@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        inviteCode: 'oa_invalid',
      })

      expect(duplicateUsername).toMatchObject({ ok: false, code: 'invalid_invite' })
      expect(duplicateEmail).toMatchObject({ ok: false, code: 'invalid_invite' })
    })

    it('maps concurrent username unique conflicts back to username_taken', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      const outcomes = await Promise.all(['one', 'two'].map(suffix => registerPasswordUser({
        username: 'raceuser', email: `${suffix}@example.com`,
        password: 'password123', confirmPassword: 'password123',
      })))
      expect(outcomes.filter(result => result.ok)).toHaveLength(1)
      expect(outcomes.find(result => !result.ok)).toMatchObject({ ok: false, code: 'username_taken' })
    })

    it('maps concurrent email unique conflicts back to email_taken', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      const outcomes = await Promise.all(['emailraceone', 'emailracetwo'].map(username => registerPasswordUser({
        username, email: 'emailrace@example.com',
        password: 'password123', confirmPassword: 'password123',
      })))
      expect(outcomes.filter(result => result.ok)).toHaveLength(1)
      expect(outcomes.find(result => !result.ok)).toMatchObject({ ok: false, code: 'email_taken' })
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

    it('rejects login when account deletion wins the session race', async () => {
      const pending = login('logintest', 'correctpass')
      const user = (await getDb().prepare(
        'SELECT id FROM users WHERE username = ?',
      ).get('logintest')) as { id: string }
      const now = Date.now()
      ;(await getDb().prepare(`
        INSERT INTO account_deletion_requests (
          user_id, requested_at, next_attempt_at, last_error_code
        ) VALUES (?, ?, ?, NULL)
      `).run(user.id, now, now))

      await expect(pending).resolves.toMatchObject({
        ok: false,
        code: 'invalid_login',
      })
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

    it('verifies an email token once and creates a session', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      const created = await registerPasswordUser({
        username: 'verifyuser',
        email: 'verify@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })
      expect(created.ok).toBe(true)
      if (!created.ok) return

      const token = (await createEmailVerificationToken(created.userId))
      const verified = (await verifyEmailToken(token))

      expect(verified.ok).toBe(true)
      if (!verified.ok) return
      expect(verified.user.username).toBe('verifyuser')
      expect(verified.token).toBeTruthy()
      expect((await validateSession(verified.token))?.username).toBe('verifyuser')

      const reused = (await verifyEmailToken(token))
      expect(reused).toMatchObject({ ok: false, code: 'invalid_or_expired_token' })
    })

    it('sends verification email using PUBLIC_API_BASE for the link', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      process.env.PUBLIC_API_BASE = 'https://api.example/'
      const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue()
      const created = await registerPasswordUser({
        username: 'mailverify',
        email: 'mailverify@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })
      expect(created.ok).toBe(true)
      if (!created.ok) return

      await sendVerificationEmail(created.userId, 'mailverify@example.com')

      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: 'mailverify@example.com',
        text: expect.stringContaining('https://api.example/api/auth/verify-email?token='),
        html: expect.stringContaining('href="https://api.example/api/auth/verify-email?token='),
      }))
    })

    it('does not send a new verification email during the user cooldown window', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      process.env.PUBLIC_API_BASE = 'https://api.example'
      const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue()
      const created = await registerPasswordUser({
        username: 'cooldownuser',
        email: 'cooldown@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      await sendVerificationEmail(created.userId, 'cooldown@example.com')
      const before = (await getDb().prepare(`
        SELECT email_verification_sent_at
        FROM users
        WHERE id = ?
      `).get(created.userId)) as { email_verification_sent_at: number }
      const tokenCountBefore = ((await getDb()
        .prepare('SELECT COUNT(*) AS count FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL')
        .get(created.userId)) as { count: number }).count
      sendEmailSpy.mockClear()

      const resent = await resendVerificationEmail('cooldown@example.com')

      expect(resent).toEqual({ ok: true })
      expect(sendEmailSpy).not.toHaveBeenCalled()
      const after = (await getDb().prepare(`
        SELECT email_verification_sent_at
        FROM users
        WHERE id = ?
      `).get(created.userId)) as { email_verification_sent_at: number }
      const tokenCountAfter = ((await getDb()
        .prepare('SELECT COUNT(*) AS count FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL')
        .get(created.userId)) as { count: number }).count
      expect(after.email_verification_sent_at).toBe(before.email_verification_sent_at)
      expect(tokenCountAfter).toBe(tokenCountBefore)
    })

    it('keeps the previous valid verification token when sending a replacement email fails', async () => {
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      process.env.PUBLIC_API_BASE = 'https://api.example'
      const created = await registerPasswordUser({
        username: 'keepoldtoken',
        email: 'keepoldtoken@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const oldToken = (await createEmailVerificationToken(created.userId))
      vi.spyOn(emailModule, 'sendEmail').mockRejectedValue(new Error('resend down'))

      await expect(sendVerificationEmail(created.userId, 'keepoldtoken@example.com')).rejects.toThrow('resend down')

      const activeTokens = ((await getDb()
        .prepare('SELECT COUNT(*) AS count FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL')
        .get(created.userId)) as { count: number }).count
      expect(activeTokens).toBe(1)
      const verified = (await verifyEmailToken(oldToken))
      expect(verified).toMatchObject({ ok: true, user: { username: 'keepoldtoken' } })
    })

    it('requires PUBLIC_API_BASE for production verification links', async () => {
      process.env.NODE_ENV = 'production'
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      delete process.env.PUBLIC_API_BASE
      const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue()
      const created = await registerPasswordUser({
        username: 'prodlink',
        email: 'prodlink@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })
      expect(created.ok).toBe(true)
      if (!created.ok) return

      await expect(sendVerificationEmail(created.userId, 'prodlink@example.com')).rejects.toThrow(/PUBLIC_API_BASE/)

      expect(sendEmailSpy).not.toHaveBeenCalled()
      const tokenCount = ((await getDb()
        .prepare('SELECT COUNT(*) AS count FROM email_verification_tokens WHERE user_id = ?')
        .get(created.userId)) as { count: number }).count
      expect(tokenCount).toBe(0)
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
      const token = (await createSession(created.id))
      const user = (await validateSession(token))
      expect(user).not.toBeNull()
      expect(user?.username).toBe('sessuser')
    })

    it('returns null for invalid token', async () => {
      const user = (await validateSession('not-a-real-token'))
      expect(user).toBeNull()
    })

    it('returns null for empty token', async () => {
      expect((await validateSession(''))).toBeNull()
    })
  })

  describe('logout', () => {
    it('invalidates the session', async () => {
      const created = await createLocalUserForTests('logoutuser', 'password123')
      const token = (await createSession(created.id))
      ;(await logout(token))
      const user = (await validateSession(token))
      expect(user).toBeNull()
    })

    it('logoutAll invalidates every session for a user', async () => {
      const user = await createLocalUserForTests('multi', 'password123', 'Multi')
      const one = (await createSession(user.id))
      const two = (await createSession(user.id))
      expect((await validateSession(one))?.username).toBe('multi')
      expect((await validateSession(two))?.username).toBe('multi')
      ;(await logoutAll(user.id))
      expect((await validateSession(one))).toBeNull()
      expect((await validateSession(two))).toBeNull()
    })
  })

  describe('deleteAccount', () => {
    const count = async (sql: string, ...params: unknown[]): Promise<Awaited<number>> =>
      ((await getDb().prepare(sql).get(...params)) as { n: number }).n

    it('removes account-owned data and discards persisted rooms involving the user', async () => {
      const db = getDb()
      const user = await createLocalUserForTests('deleteme', 'password123', 'Delete Me')
      const other = await createLocalUserForTests('otheruser', 'password123', 'Other User')
      const token = (await createSession(user.id))
      const now = Date.now()

      ;(await db.prepare(`
        INSERT INTO auth_identities (
          id, user_id, provider, provider_user_id, provider_login, provider_email,
          provider_email_verified, display_name, avatar_url, linked_at
        ) VALUES (?, ?, 'github', 'gh-delete', 'deleteme', 'delete@example.test', 1, 'Delete Me', NULL, ?)
      `).run('identity-delete', user.id, now))
      ;(await db.prepare('INSERT INTO oauth_states (state_hash, provider, intent, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('state-delete', 'github', 'link', user.id, now + 1000, now))

      ;(await db.prepare(`
        INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at)
        VALUES (?, ?, ?, 2, 'playing', 1, '[]', ?, ?)
      `).run('owned-room', user.id, '{"private":"name"}', now, now))
      ;(await db.prepare(`
        INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at)
        VALUES (?, ?, ?, 2, 'playing', 1, '[]', ?, ?)
      `).run('joined-room', other.id, '{"private":"name"}', now, now))
      ;(await db.prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)')
        .run('owned-room', user.id, 0, now))
      ;(await db.prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)')
        .run('joined-room', user.id, 1, now))
      ;(await db.prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)')
        .run('joined-room', other.id, 0, now))
      ;(await db.prepare(`
        INSERT INTO game_contexts (room_id, lifecycle, created_at, updated_at)
        VALUES ('owned-room', 'active', 1, 1), ('joined-room', 'active', 1, 1)
      `).run())
      ;(await db.prepare(`
        INSERT INTO game_results (
          room_id, started_at, finished_at, rounds_played, player_count,
          enable_community_deck, enable_parent_cards, enable_through_the_seasons, enable_farmers_of_the_moor,
          enable_snake_opening
        ) VALUES ('finished-room', ?, ?, 14, 2, 0, 0, 0, 0, 0)
      `).run(now - 1000, now))
      ;(await db.prepare(`
        INSERT INTO game_result_players (
          room_id, player_index, game_player_id, user_id, display_name, score
        ) VALUES ('finished-room', 0, 'p1', ?, 'Delete Me', 42)
      `).run(user.id))

      ;(await db.prepare(`
        INSERT INTO workshop_cards (
          id, author_id, card_id, card_type, name, description, card_json, review_status, created_at, updated_at
        ) VALUES (?, ?, ?, 'minor', ?, '', '{}', 'unsubmitted', ?, ?)
      `).run('owned-card', user.id, 'CUSTOM_DELETE', 'Delete Card', now, now))
      ;(await db.prepare(`
        INSERT INTO workshop_cards (
          id, author_id, card_id, card_type, name, description, card_json, review_status, created_at, updated_at
        ) VALUES (?, ?, ?, 'minor', ?, '', '{}', 'unsubmitted', ?, ?)
      `).run('other-card', other.id, 'CUSTOM_OTHER', 'Other Card', now, now))
      ;(await db.prepare('INSERT INTO workshop_card_versions (id, card_id, card_json, version_number, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('owned-version', 'owned-card', '{}', 1, user.id, now))
      ;(await db.prepare('INSERT INTO workshop_card_versions (id, card_id, card_json, version_number, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('other-card-user-version', 'other-card', '{}', 1, user.id, now))
      ;(await db.prepare('INSERT INTO card_likes (user_id, card_id, created_at) VALUES (?, ?, ?)')
        .run(user.id, 'other-card', now))
      ;(await db.prepare('INSERT INTO card_likes (user_id, card_id, created_at) VALUES (?, ?, ?)')
        .run(other.id, 'owned-card', now))
      ;(await db.prepare('INSERT INTO card_comments (id, card_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('user-comment', 'other-card', user.id, 'delete me', now))
      ;(await db.prepare('INSERT INTO card_comments (id, card_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('owned-card-comment', 'owned-card', other.id, 'deleted with card', now))
      ;(await db.prepare('INSERT INTO sandbox_cards (user_id, workshop_card_id, added_at) VALUES (?, ?, ?)')
        .run(user.id, 'other-card', now))
      ;(await db.prepare('INSERT INTO sandbox_cards (user_id, workshop_card_id, added_at) VALUES (?, ?, ?)')
        .run(other.id, 'owned-card', now))
      ;(await db.prepare('INSERT INTO sandbox_settings (user_id, player_count, deck_ids_json, updated_at) VALUES (?, 2, ?, ?)')
        .run(user.id, '["A"]', now))
      ;(await db.prepare('INSERT INTO github_propose_rate_limit (user_id, last_propose_at) VALUES (?, ?)')
        .run(user.id, now))
      ;(await db.prepare('INSERT INTO github_propose_audit (id, user_id, workshop_card_id, action, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('audit-user', user.id, 'other-card', 'propose', now))
      ;(await db.prepare('INSERT INTO github_propose_audit (id, user_id, workshop_card_id, action, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('audit-owned-card', other.id, 'owned-card', 'propose', now))

      expect((await deleteAccount(user.id))).toEqual({ ok: true })

      expect((await validateSession(token))).toBeNull()
      expect(await count('SELECT COUNT(*) AS n FROM users WHERE id = ?', user.id)).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM users WHERE id = ?', other.id)).toBe(1)
      expect(await count('SELECT COUNT(*) AS n FROM auth_identities WHERE user_id = ?', user.id)).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM oauth_states WHERE user_id = ?', user.id)).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM room_players WHERE user_id = ?', user.id)).toBe(0)
      expect((await db.prepare(`
        SELECT room_id, player_index, user_id
        FROM game_context_participants
        ORDER BY room_id, player_index
      `).all())).toEqual([
        { room_id: 'joined-room', player_index: 0, user_id: other.id },
        { room_id: 'joined-room', player_index: 1, user_id: null },
        { room_id: 'owned-room', player_index: 0, user_id: null },
      ])
      expect((await db.prepare(`
        SELECT user_id, display_name
        FROM game_result_players
        WHERE room_id = 'finished-room' AND player_index = 0
      `).get())).toEqual({
        user_id: null,
        display_name: 'Deleted player (seat 1)',
      })
      expect(await count('SELECT COUNT(*) AS n FROM workshop_cards WHERE id = ?', 'owned-card')).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM workshop_cards WHERE id = ?', 'other-card')).toBe(1)
      expect(await count('SELECT COUNT(*) AS n FROM workshop_card_versions WHERE created_by = ?', user.id)).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM card_likes WHERE user_id = ? OR card_id = ?', user.id, 'owned-card')).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM card_comments WHERE author_id = ? OR card_id = ?', user.id, 'owned-card')).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM sandbox_cards WHERE user_id = ? OR workshop_card_id = ?', user.id, 'owned-card')).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM sandbox_settings WHERE user_id = ?', user.id)).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM github_propose_rate_limit WHERE user_id = ?', user.id)).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM github_propose_audit WHERE user_id = ? OR workshop_card_id = ?', user.id, 'owned-card')).toBe(0)

      expect(await count('SELECT COUNT(*) AS n FROM rooms')).toBe(0)
    })

    it('reserves deleted admin usernames after removing the user row', async () => {
      process.env.ADMIN_USERS = 'deleteadmin'
      const user = await createLocalUserForTests('deleteadmin', 'password123', 'Delete Admin')

      expect((await deleteAccount(user.id))).toEqual({ ok: true })

      expect(await count('SELECT COUNT(*) AS n FROM users WHERE username = ?', 'deleteadmin')).toBe(0)
      expect(await count('SELECT COUNT(*) AS n FROM reserved_usernames WHERE username = ?', 'deleteadmin')).toBe(1)
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
    beforeEach(async () => {
      ;(await resetRateLimitsForTests())
    })

    it('rejects requests over the configured window limit', async () => {
      expect((await checkRateLimit('auth:test', { windowMs: 1000, max: 2 }))).toBe(true)
      expect((await checkRateLimit('auth:test', { windowMs: 1000, max: 2 }))).toBe(true)
      expect((await checkRateLimit('auth:test', { windowMs: 1000, max: 2 }))).toBe(false)
    })
  })
})
