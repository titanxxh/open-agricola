import type Database from 'better-sqlite3'
import { createHash, randomBytes } from 'node:crypto'
import { nanoid } from 'nanoid'
import { getDb } from './db.ts'

export type RegistrationPolicy = 'invite_only' | 'open' | 'disabled'
export type InviteStatus = 'active' | 'used' | 'expired' | 'revoked'

export type CreatedInvite = {
  id: string
  code: string
  createdAt: number
  expiresAt: number | null
}

export type ListedInvite = {
  id: string
  createdAt: number
  expiresAt: number | null
  usedAt: number | null
  usedBy: string | null
  revokedAt: number | null
  status: InviteStatus
}

type InviteRow = {
  id: string
  created_at: number
  expires_at: number | null
  used_at: number | null
  used_by: string | null
  revoked_at: number | null
}

export function getRegistrationPolicy(raw: string | undefined = process.env.ACCOUNT_REGISTRATION_POLICY): RegistrationPolicy {
  if (raw === 'open' || raw === 'disabled' || raw === 'invite_only') return raw
  return 'invite_only'
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex')
}

function statusFor(row: InviteRow, now: number): InviteStatus {
  if (row.used_at !== null) return 'used'
  if (row.revoked_at !== null) return 'revoked'
  if (row.expires_at !== null && row.expires_at <= now) return 'expired'
  return 'active'
}

export function createInvite(createdBy: string, expiresInDays?: number): CreatedInvite {
  const db = getDb()
  const id = nanoid()
  const code = `oa_${randomBytes(18).toString('base64url')}`
  const createdAt = Date.now()
  const expiresAt = expiresInDays && expiresInDays > 0
    ? createdAt + Math.floor(expiresInDays * 24 * 60 * 60 * 1000)
    : null
  db.prepare(`
    INSERT INTO account_invites (id, code_hash, created_by, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, hashInviteCode(code), createdBy, createdAt, expiresAt)
  return { id, code, createdAt, expiresAt }
}

export function listInvites(now: number = Date.now()): ListedInvite[] {
  const rows = getDb().prepare(`
    SELECT id, created_at, expires_at, used_at, used_by, revoked_at
    FROM account_invites
    ORDER BY created_at DESC
  `).all() as InviteRow[]
  return rows.map(row => ({
    id: row.id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedBy: row.used_by,
    revokedAt: row.revoked_at,
    status: statusFor(row, now),
  }))
}

export function revokeInvite(inviteId: string, now: number = Date.now()): boolean {
  const result = getDb().prepare(`
    UPDATE account_invites
    SET revoked_at = ?
    WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
  `).run(now, inviteId)
  return result.changes === 1
}

export function consumeInviteCode(
  db: Database.Database,
  code: string,
  userId: string,
  now: number = Date.now(),
): boolean {
  const normalized = code.trim()
  if (!normalized) return false
  const result = db.prepare(`
    UPDATE account_invites
    SET used_by = ?, used_at = ?
    WHERE code_hash = ?
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
  `).run(userId, now, hashInviteCode(normalized), now)
  return result.changes === 1
}
