import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db.ts', async () => {
  const { createTestDatabase } = await import('./_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})

const {
  consumeInviteCode,
  createInvite,
  consumeInviteCodeHash,
  getRegistrationPolicy,
  hashInviteCode,
  isInviteCodeAvailable,
  listInvites,
  revokeInvite,
} = await import('../invites.ts')
const { getDb } = await import('../db.ts')
afterAll(async () => { await getDb().close() })

async function insertUser(id: string, username = id): Promise<Awaited<void>> {
  ;(await getDb().prepare(`
    INSERT INTO users (id, username, display_name, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, username, 'hash', Date.now()))
}

const future = (days = 7) => Date.now() + days * 24 * 60 * 60 * 1000

describe('invites', () => {
  beforeEach(async () => {
    ;(await getDb().exec(`
      DELETE FROM account_invites;
      DELETE FROM users;
    `))
    await insertUser('admin', 'admin')
    await insertUser('new-user', 'newuser')
  })

  it('defaults registration policy to invite_only', () => {
    expect(getRegistrationPolicy(undefined)).toBe('invite_only')
    expect(getRegistrationPolicy('')).toBe('invite_only')
    expect(getRegistrationPolicy('bad-value')).toBe('invite_only')
    expect(getRegistrationPolicy('open')).toBe('open')
    expect(getRegistrationPolicy('disabled')).toBe('disabled')
  })

  it('creates an invite and stores only the code hash', async () => {
    const invite = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    expect(invite.code).toMatch(/^oa_/)
    expect(invite.expiresAt).not.toBeNull()
    expect(invite.expiresAt!).toBeGreaterThan(invite.createdAt)

    const row = (await getDb().prepare('SELECT code_hash FROM account_invites WHERE id = ?').get(invite.id)) as { code_hash: string }
    expect(row.code_hash).toBe(hashInviteCode(invite.code))
    expect(row.code_hash).not.toContain(invite.code)
  })

  it('stores a custom code hash and reusable limit without plaintext', async () => {
    const invite = (await createInvite('admin', { code: '  FARM-2026  ', expiresAt: future(), maxUses: 3 }))
    const row = (await getDb().prepare(`
      SELECT code_hash, use_count, max_uses FROM account_invites WHERE id = ?
    `).get(invite.id))
    expect(row).toEqual({
      code_hash: hashInviteCode('FARM-2026'),
      use_count: 0,
      max_uses: 3,
    })
    expect(JSON.stringify(row)).not.toContain('FARM-2026')
  })

  it('lists invite status without returning plaintext codes', async () => {
    const active = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const used = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const revoked = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const expired = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const now = Date.now()
    expect((await consumeInviteCode(getDb(), used.code, 'new-user', now))).toBe(true)
    expect((await revokeInvite(revoked.id, now))).toBe(true)
    ;(await getDb().prepare('UPDATE account_invites SET expires_at = ? WHERE id = ?').run(now - 1, expired.id))

    const invites = (await listInvites(now))
    expect(invites.find(invite => invite.id === active.id)?.status).toBe('active')
    expect(invites.find(invite => invite.id === used.id)?.status).toBe('used')
    expect(invites.find(invite => invite.id === revoked.id)?.status).toBe('revoked')
    expect(invites.find(invite => invite.id === expired.id)?.status).toBe('expired')
    expect(JSON.stringify(invites)).not.toContain(active.code)
  })

  it('consumes an invite only once', async () => {
    const invite = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    expect((await consumeInviteCode(getDb(), invite.code, 'new-user'))).toBe(true)
    expect((await consumeInviteCode(getDb(), invite.code, 'new-user'))).toBe(false)

    const row = (await getDb().prepare('SELECT used_by, used_at FROM account_invites WHERE id = ?').get(invite.id)) as { used_by: string; used_at: number }
    expect(row.used_by).toBe('new-user')
    expect(row.used_at).toBeGreaterThan(0)
  })

  it('checks invite availability without consuming it', async () => {
    const invite = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))

    expect((await isInviteCodeAvailable(invite.code))).toBe(true)
    expect((await consumeInviteCode(getDb(), invite.code, 'new-user'))).toBe(true)
  })

  it('checks invite availability rejects used expired and revoked codes', async () => {
    const used = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const expired = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const revoked = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const now = Date.now()

    await insertUser('used-user', 'used-user')
    expect((await consumeInviteCode(getDb(), used.code, 'used-user', now))).toBe(true)
    ;(await getDb().prepare('UPDATE account_invites SET expires_at = ? WHERE id = ?').run(now - 1, expired.id))
    expect((await revokeInvite(revoked.id, now))).toBe(true)

    expect((await isInviteCodeAvailable(used.code, now))).toBe(false)
    expect((await isInviteCodeAvailable(expired.code, now))).toBe(false)
    expect((await isInviteCodeAvailable(revoked.code, now))).toBe(false)
    expect((await isInviteCodeAvailable('oa_missing', now))).toBe(false)
  })

  it('consumes an invite by hash only once', async () => {
    const invite = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const hash = hashInviteCode(invite.code)

    await insertUser('other-user', 'other-user')
    expect((await consumeInviteCodeHash(getDb(), hash, 'new-user'))).toBe(true)
    expect((await consumeInviteCodeHash(getDb(), hash, 'other-user'))).toBe(false)

    const row = (await getDb().prepare('SELECT used_by, used_at FROM account_invites WHERE id = ?').get(invite.id)) as {
      used_by: string
      used_at: number
    }
    expect(row.used_by).toBe('new-user')
    expect(row.used_at).toBeGreaterThan(0)
  })

  it('rejects expired and revoked invites', async () => {
    const expired = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const revoked = (await createInvite('admin', { expiresAt: future(), maxUses: 1 }))
    const now = Date.now()
    ;(await getDb().prepare('UPDATE account_invites SET expires_at = ? WHERE id = ?').run(now - 1, expired.id))
    expect((await revokeInvite(revoked.id, now))).toBe(true)

    expect((await consumeInviteCode(getDb(), expired.code, 'new-user', now))).toBe(false)
    expect((await consumeInviteCode(getDb(), revoked.code, 'new-user', now))).toBe(false)
  })

  it('remains active until the final allowed use', async () => {
    const invite = (await createInvite('admin', { code: 'THREE', expiresAt: future(), maxUses: 3 }))
    expect((await consumeInviteCode(getDb(), invite.code, 'new-user'))).toBe(true)
    expect((await consumeInviteCodeHash(getDb(), hashInviteCode(invite.code), 'admin'))).toBe(true)
    expect((await listInvites()).find(row => row.id === invite.id)).toMatchObject({
      status: 'active', useCount: 2, maxUses: 3,
    })
    expect((await consumeInviteCode(getDb(), invite.code, 'new-user'))).toBe(true)
    expect((await consumeInviteCode(getDb(), invite.code, 'new-user'))).toBe(false)
    expect((await listInvites()).find(row => row.id === invite.id)).toMatchObject({
      status: 'used', useCount: 3, maxUses: 3,
    })
  })

  it('revokes a partially used reusable invite', async () => {
    const invite = (await createInvite('admin', { code: 'REVOKE', expiresAt: future(), maxUses: 3 }))
    expect((await consumeInviteCode(getDb(), invite.code, 'new-user'))).toBe(true)
    expect((await revokeInvite(invite.id))).toBe(true)
    expect((await consumeInviteCode(getDb(), invite.code, 'admin'))).toBe(false)
    expect((await listInvites()).find(row => row.id === invite.id)?.status).toBe('revoked')
  })

  it('hashes trimmed invite codes', () => {
    expect(hashInviteCode('  oa_example  ')).toBe(hashInviteCode('oa_example'))
  })
})
