import type { PostgresDatabase as Database } from './database/postgres'
import { createHash, randomBytes } from 'node:crypto'
import { nanoid } from 'nanoid'
import { getDb } from './db.ts'

export type RegistrationPolicy = 'invite_only' | 'open' | 'disabled'
export type InviteStatus = 'active' | 'used' | 'expired' | 'revoked'

export type CreateInviteInput = {
  code?: string
  expiresAt: number
  maxUses: number
}

export type CreatedInvite = {
  id: string
  code: string
  createdAt: number
  expiresAt: number
  maxUses: number
  useCount: number
}

export type ListedInvite = {
  id: string
  createdAt: number
  expiresAt: number | null
  usedAt: number | null
  usedBy: string | null
  revokedAt: number | null
  maxUses: number
  useCount: number
  status: InviteStatus
}

type InviteRow = {
  id: string
  created_at: number
  expires_at: number | null
  used_at: number | null
  used_by: string | null
  revoked_at: number | null
  max_uses: number
  use_count: number
}

export function getRegistrationPolicy(raw: string | undefined = process.env.ACCOUNT_REGISTRATION_POLICY): RegistrationPolicy {
  if (raw === 'open' || raw === 'disabled' || raw === 'invite_only') return raw
  return 'invite_only'
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex')
}

function statusFor(row: InviteRow, now: number): InviteStatus {
  if (row.revoked_at !== null) return 'revoked'
  if (row.use_count >= row.max_uses) return 'used'
  if (row.expires_at !== null && row.expires_at <= now) return 'expired'
  return 'active'
}

export async function createInvite(createdBy: string, input: CreateInviteInput): Promise<Awaited<CreatedInvite>> {
  const db = getDb()
  const id = nanoid()
  const code = input.code?.trim() || `oa_${randomBytes(18).toString('base64url')}`
  const createdAt = Date.now()
  ;(await db.prepare(`
    INSERT INTO account_invites (
      id, code_hash, created_by, created_at, expires_at, max_uses, use_count
    ) VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(id, hashInviteCode(code), createdBy, createdAt, input.expiresAt, input.maxUses))
  return {
    id,
    code,
    createdAt,
    expiresAt: input.expiresAt,
    maxUses: input.maxUses,
    useCount: 0,
  }
}

export async function listInvites(now: number = Date.now()): Promise<Awaited<ListedInvite[]>> {
  const rows = (await getDb().prepare(`
    SELECT id, created_at, expires_at, used_at, used_by, revoked_at, max_uses, use_count
    FROM account_invites
    ORDER BY created_at DESC
  `).all()) as InviteRow[]
  return rows.map(row => ({
    id: row.id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedBy: row.used_by,
    revokedAt: row.revoked_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    status: statusFor(row, now),
  }))
}

async function isInviteHashAvailable(codeHash: string, now: number): Promise<Awaited<boolean>> {
  const row = (await getDb().prepare(`
    SELECT id
    FROM account_invites
    WHERE code_hash = ?
      AND use_count < max_uses
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
  `).get(codeHash, now))
  return Boolean(row)
}

export async function isInviteCodeAvailable(code: string, now: number = Date.now()): Promise<Awaited<boolean>> {
  const normalized = code.trim()
  if (!normalized) return false
  return (await isInviteHashAvailable(hashInviteCode(normalized), now))
}

export async function revokeInvite(inviteId: string, now: number = Date.now()): Promise<Awaited<boolean>> {
  const result = (await getDb().prepare(`
    UPDATE account_invites
    SET revoked_at = ?
    WHERE id = ?
      AND use_count < max_uses
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
  `).run(now, inviteId, now))
  return result.changes === 1
}

async function consumeInviteHash(
  db: Database,
  codeHash: string,
  userId: string,
  now: number,
): Promise<Awaited<boolean>> {
  const result = (await db.prepare(`
    UPDATE account_invites
    SET use_count = use_count + 1, used_by = ?, used_at = ?
    WHERE code_hash = ?
      AND use_count < max_uses
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
  `).run(userId, now, codeHash, now))
  return result.changes === 1
}

export async function consumeInviteCode(
  db: Database,
  code: string,
  userId: string,
  now: number = Date.now(),
): Promise<Awaited<boolean>> {
  const normalized = code.trim()
  if (!normalized) return false
  return (await consumeInviteHash(db, hashInviteCode(normalized), userId, now))
}

export async function consumeInviteCodeHash(
  db: Database,
  codeHash: string,
  userId: string,
  now: number = Date.now(),
): Promise<Awaited<boolean>> {
  const normalizedHash = codeHash.trim()
  if (!normalizedHash) return false
  return (await consumeInviteHash(db, normalizedHash, userId, now))
}
