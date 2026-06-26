import { beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'

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
  `)
  return { getDb: () => db, cleanExpiredSessions: () => {} }
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

function insertUser(id: string, username = id): void {
  getDb().prepare(`
    INSERT INTO users (id, username, display_name, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, username, 'hash', Date.now())
}

describe('invites', () => {
  beforeEach(() => {
    getDb().exec(`
      DELETE FROM account_invites;
      DELETE FROM users;
    `)
    insertUser('admin', 'admin')
    insertUser('new-user', 'newuser')
  })

  it('defaults registration policy to invite_only', () => {
    expect(getRegistrationPolicy(undefined)).toBe('invite_only')
    expect(getRegistrationPolicy('')).toBe('invite_only')
    expect(getRegistrationPolicy('bad-value')).toBe('invite_only')
    expect(getRegistrationPolicy('open')).toBe('open')
    expect(getRegistrationPolicy('disabled')).toBe('disabled')
  })

  it('creates an invite and stores only the code hash', () => {
    const invite = createInvite('admin', 7)
    expect(invite.code).toMatch(/^oa_/)
    expect(invite.expiresAt).toBeGreaterThan(invite.createdAt)

    const row = getDb().prepare('SELECT code_hash FROM account_invites WHERE id = ?').get(invite.id) as { code_hash: string }
    expect(row.code_hash).toBe(createHash('sha256').update(invite.code).digest('hex'))
    expect(row.code_hash).not.toContain(invite.code)
  })

  it('lists invite status without returning plaintext codes', () => {
    const active = createInvite('admin', 7)
    const used = createInvite('admin', 7)
    const revoked = createInvite('admin', 7)
    const expired = createInvite('admin', 1)
    const now = Date.now()
    expect(consumeInviteCode(getDb(), used.code, 'new-user', now)).toBe(true)
    expect(revokeInvite(revoked.id, now)).toBe(true)
    getDb().prepare('UPDATE account_invites SET expires_at = ? WHERE id = ?').run(now - 1, expired.id)

    const invites = listInvites(now)
    expect(invites.find(invite => invite.id === active.id)?.status).toBe('active')
    expect(invites.find(invite => invite.id === used.id)?.status).toBe('used')
    expect(invites.find(invite => invite.id === revoked.id)?.status).toBe('revoked')
    expect(invites.find(invite => invite.id === expired.id)?.status).toBe('expired')
    expect(JSON.stringify(invites)).not.toContain(active.code)
  })

  it('consumes an invite only once', () => {
    const invite = createInvite('admin', 7)
    expect(consumeInviteCode(getDb(), invite.code, 'new-user')).toBe(true)
    expect(consumeInviteCode(getDb(), invite.code, 'new-user')).toBe(false)

    const row = getDb().prepare('SELECT used_by, used_at FROM account_invites WHERE id = ?').get(invite.id) as { used_by: string; used_at: number }
    expect(row.used_by).toBe('new-user')
    expect(row.used_at).toBeGreaterThan(0)
  })

  it('checks invite availability without consuming it', () => {
    const invite = createInvite('admin', 7)

    expect(isInviteCodeAvailable(invite.code)).toBe(true)
    expect(consumeInviteCode(getDb(), invite.code, 'new-user')).toBe(true)
  })

  it('checks invite availability rejects used expired and revoked codes', () => {
    const used = createInvite('admin', 7)
    const expired = createInvite('admin', 1)
    const revoked = createInvite('admin', 7)
    const now = Date.now()

    insertUser('used-user', 'used-user')
    expect(consumeInviteCode(getDb(), used.code, 'used-user', now)).toBe(true)
    getDb().prepare('UPDATE account_invites SET expires_at = ? WHERE id = ?').run(now - 1, expired.id)
    expect(revokeInvite(revoked.id, now)).toBe(true)

    expect(isInviteCodeAvailable(used.code, now)).toBe(false)
    expect(isInviteCodeAvailable(expired.code, now)).toBe(false)
    expect(isInviteCodeAvailable(revoked.code, now)).toBe(false)
    expect(isInviteCodeAvailable('oa_missing', now)).toBe(false)
  })

  it('consumes an invite by hash only once', () => {
    const invite = createInvite('admin', 7)
    const hash = hashInviteCode(invite.code)

    insertUser('other-user', 'other-user')
    expect(consumeInviteCodeHash(getDb(), hash, 'new-user')).toBe(true)
    expect(consumeInviteCodeHash(getDb(), hash, 'other-user')).toBe(false)

    const row = getDb().prepare('SELECT used_by, used_at FROM account_invites WHERE id = ?').get(invite.id) as {
      used_by: string
      used_at: number
    }
    expect(row.used_by).toBe('new-user')
    expect(row.used_at).toBeGreaterThan(0)
  })

  it('rejects expired and revoked invites', () => {
    const expired = createInvite('admin', 1)
    const revoked = createInvite('admin', 7)
    const now = Date.now()
    getDb().prepare('UPDATE account_invites SET expires_at = ? WHERE id = ?').run(now - 1, expired.id)
    expect(revokeInvite(revoked.id, now)).toBe(true)

    expect(consumeInviteCode(getDb(), expired.code, 'new-user', now)).toBe(false)
    expect(consumeInviteCode(getDb(), revoked.code, 'new-user', now)).toBe(false)
  })

  it('hashes trimmed invite codes', () => {
    expect(hashInviteCode('  oa_example  ')).toBe(hashInviteCode('oa_example'))
  })
})
