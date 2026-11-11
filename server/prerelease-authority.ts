import { createHash, randomBytes } from 'node:crypto'
import {
  PRERELEASE_IDENTITY_FRESHNESS_MS, PRERELEASE_IDENTITY_PROTOCOL,
  PRERELEASE_SESSION_MAX_AGE_MS,
  type PrereleaseIdentityState, type PrereleaseEntry, type PrereleaseIdentityEvent, type PrereleaseIdentityReceipt,
} from '../shared/contract/prerelease-identity'
import { HOSTED_APP_PATH } from '../shared/contract/protocol/app-location'
import { isAdmin } from './auth'
import type { PostgresDatabase } from './database/postgres'
import { consumeRateLimit } from './database/rate-limit'
import { currentPrereleaseGeneration, lockPrereleaseIdentity } from './prerelease-identity-lifecycle'

export type PrereleaseTarget = { sourceOrigin: string; targetOrigin: string; serviceKey: string; entryEnabled: boolean }

const strictOrigin = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password ? url.origin : undefined
  } catch { return undefined }
}

export const configuredFormalAppOrigin = (): string | undefined => strictOrigin(process.env.PUBLIC_APP_ORIGIN)

/** Partial or malformed configuration stays closed. Candidate code gets only the target key. */
export function configuredPrereleaseTarget(): PrereleaseTarget | undefined {
  const sourceOrigin = configuredFormalAppOrigin()
  const targetOrigin = strictOrigin(process.env.PRERELEASE_APP_ORIGIN)
  const formalApiOrigin = strictOrigin(process.env.PUBLIC_API_BASE)
  const serviceKey = process.env.PRERELEASE_IDENTITY_SERVICE_KEY
  if (!sourceOrigin || !formalApiOrigin || !targetOrigin || !serviceKey || Buffer.byteLength(serviceKey) < 32) return undefined
  const targetHostname = new URL(targetOrigin).hostname
  if ([sourceOrigin, formalApiOrigin].some(origin => new URL(origin).hostname === targetHostname)) return undefined
  return { sourceOrigin, targetOrigin, serviceKey, entryEnabled: process.env.PRERELEASE_ENTRY_ENABLED === 'true' }
}

export class PrereleaseAuthorityError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status }
}

const hash = (secret: string) => createHash('sha256').update(secret).digest('base64url')
const opaque = () => randomBytes(32).toString('base64url')
type SourceRow = { id: string; username: string; display_name: string; expires_at: number; beta_access: boolean }
type HandoffRow = { generation_id: string; user_id: string; source_token: string; target_origin: string; browser_challenge: string; return_to: string; expires_at: number }
type GrantRow = {
  id: string; user_id: string; source_token: string | null; target_origin: string; expires_at: number; revoked_at: number | null
  username: string | null; display_name: string | null; deleting: boolean; source_expires_at: number | null; beta_access: boolean
}

export class PrereleaseAuthority {
  readonly db: PostgresDatabase
  readonly now: () => number
  constructor(db: PostgresDatabase, now: () => number = Date.now) { this.db = db; this.now = now }

  private async source(token: string, now: number): Promise<SourceRow> {
    const owner = await this.db.prepare('SELECT user_id FROM sessions WHERE token=?').get<{ user_id: string }>(token)
    if (!owner) throw new PrereleaseAuthorityError('not_authenticated', 401)
    // Password reset and account deletion lock the user before touching sessions.
    const account = await this.db.prepare(`SELECT id,username,display_name FROM users WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=users.id) FOR UPDATE`)
      .get<{ id: string; username: string; display_name: string }>(owner.user_id)
    const session = account && await this.db.prepare('SELECT expires_at FROM sessions WHERE token=? AND user_id=? AND expires_at>? FOR UPDATE')
      .get<{ expires_at: number }>(token, account.id, now)
    if (!account || !session) throw new PrereleaseAuthorityError('not_authenticated', 401)
    const betaAccess = !!await this.db.prepare('SELECT 1 FROM beta_access WHERE user_id=?').get(account.id)
    if (!isAdmin(account.username) && !betaAccess) throw new PrereleaseAuthorityError('beta_access_required', 403)
    return { ...account, expires_at: session.expires_at, beta_access: betaAccess }
  }

  async entry(token: string, target: PrereleaseTarget | undefined): Promise<PrereleaseEntry> {
    await this.source(token, this.now())
    const generation = target && await currentPrereleaseGeneration(this.db, target.targetOrigin)
    return target?.entryEnabled && generation?.admission_open && generation.retired_at === null ? { kind: 'available', channel: 'prerelease', startUrl: `${target.targetOrigin}${HOSTED_APP_PATH}auth/start`, returnTo: `${target.sourceOrigin}/` } : { kind: 'disabled' }
  }

  async issue(token: string, target: PrereleaseTarget, input: { browserChallenge: string; returnTo: string }) {
    const now = this.now()
    return this.db.transaction(async () => {
      const source = await this.source(token, now)
      await lockPrereleaseIdentity(this.db)
      const generation = await currentPrereleaseGeneration(this.db, target.targetOrigin)
      if (!generation?.admission_open || generation.retired_at !== null) throw new PrereleaseAuthorityError('prerelease_generation_unavailable', 503)
      if (!(await consumeRateLimit(this.db, 'prerelease:handoff', source.id, 10, 60_000, now)).allowed) {
        throw new PrereleaseAuthorityError('rate_limited', 429)
      }
      const code = opaque()
      const expiresAt = now + 60_000
      await this.db.prepare('DELETE FROM prerelease_identity_handoffs WHERE expires_at<=?').run(now)
      await this.db.prepare(`INSERT INTO prerelease_identity_handoffs(code_hash,user_id,source_token,target_origin,browser_challenge,return_to,expires_at,created_at,generation_id)
        SELECT ?,user_id,?,?,?,?,?,?,? FROM sessions WHERE token=?`).run(hash(code), token, target.targetOrigin, input.browserChallenge, input.returnTo, expiresAt, now, generation.id, token)
      return { ok: true, protocolVersion: PRERELEASE_IDENTITY_PROTOCOL, code, expiresAt,
        callbackUrl: `${target.targetOrigin}${HOSTED_APP_PATH}auth/handoff`, returnTo: input.returnTo }
    })()
  }

  async exchange(target: PrereleaseTarget, input: { code: string; browserVerifier: string; returnTo: string; generationId: string }): Promise<PrereleaseIdentityState> {
    const now = this.now()
    return this.db.transaction(async () => {
      const pending = await this.db.prepare('SELECT * FROM prerelease_identity_handoffs WHERE code_hash=?').get<HandoffRow>(hash(input.code))
      if (!pending) throw new PrereleaseAuthorityError('prerelease_handoff_invalid', 409)
      const source = await this.source(pending.source_token, now)
      await lockPrereleaseIdentity(this.db)
      const generation = await currentPrereleaseGeneration(this.db, target.targetOrigin)
      if (!generation?.admission_open || generation.retired_at !== null || generation.id !== input.generationId) throw new PrereleaseAuthorityError('prerelease_generation_unavailable', 409)
      const row = await this.db.prepare('SELECT * FROM prerelease_identity_handoffs WHERE code_hash=? FOR UPDATE').get<HandoffRow>(hash(input.code))
      if (!row || row.generation_id !== generation.id || row.expires_at <= now || row.target_origin !== target.targetOrigin || row.browser_challenge !== hash(input.browserVerifier) || row.return_to !== input.returnTo) {
        throw new PrereleaseAuthorityError('prerelease_handoff_invalid', 409)
      }
      if (source.id !== row.user_id) throw new PrereleaseAuthorityError('prerelease_handoff_invalid', 409)
      const grantId = opaque()
      await this.db.prepare(`INSERT INTO prerelease_identity_grants(id,user_id,source_token,target_origin,created_at,expires_at,generation_id)
        VALUES(?,?,?,?,?,?,?)`).run(grantId, source.id, row.source_token, target.targetOrigin, now, Math.min(now + PRERELEASE_SESSION_MAX_AGE_MS, source.expires_at), generation.id)
      await this.db.prepare('DELETE FROM prerelease_identity_handoffs WHERE code_hash=?').run(hash(input.code))
      return this.status(target, grantId, generation.id, now)
    })()
  }

  async status(target: PrereleaseTarget, grantId: string, generationId: string, now = this.now()): Promise<PrereleaseIdentityState> {
    const row = await this.db.prepare(`SELECT g.*, u.username, u.display_name,
      EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=g.user_id) AS deleting,
      s.expires_at AS source_expires_at, EXISTS(SELECT 1 FROM beta_access b WHERE b.user_id=g.user_id) AS beta_access
      FROM prerelease_identity_grants g LEFT JOIN users u ON u.id=g.user_id LEFT JOIN sessions s ON s.token=g.source_token AND s.user_id=g.user_id
      WHERE g.id=? AND g.target_origin=? AND g.generation_id=? AND g.projection_erased_at IS NULL`).get<GrantRow>(grantId, target.targetOrigin, generationId)
    if (!row) throw new PrereleaseAuthorityError('prerelease_grant_not_found', 404)
    const activeAccount = row.username !== null && row.display_name !== null && !row.deleting
    const sourceExpiresAt = row.source_expires_at
    return {
      protocolVersion: PRERELEASE_IDENTITY_PROTOCOL, channel: 'prerelease', targetOrigin: target.targetOrigin, generationId, grantId,
      account: activeAccount && row.username !== null && row.display_name !== null
        ? { kind: 'active', subject: { id: row.user_id, username: row.username, displayName: row.display_name } } : { kind: 'deleted' },
      source: sourceExpiresAt !== null && sourceExpiresAt > now ? { kind: 'active', expiresAt: sourceExpiresAt } : { kind: 'invalid' },
      betaAccess: activeAccount && row.username !== null && (isAdmin(row.username) || row.beta_access),
      grant: { kind: row.revoked_at === null && row.expires_at > now ? 'active' : 'revoked', expiresAt: row.expires_at },
      confirmedAt: now, validUntil: Math.min(now + PRERELEASE_IDENTITY_FRESHNESS_MS, row.expires_at, sourceExpiresAt ?? now),
    }
  }

  async events(target: PrereleaseTarget, generationId: string): Promise<PrereleaseIdentityEvent[]> {
    const rows = await this.db.prepare(`SELECT id,kind,user_id,grant_id,created_at FROM prerelease_identity_events
      WHERE target_origin=? AND generation_id=? AND acknowledged_at IS NULL ORDER BY created_at,id LIMIT 100`).all<{
        id: string; kind: PrereleaseIdentityEvent['kind']; user_id: string; grant_id: string | null; created_at: number
      }>(target.targetOrigin, generationId)
    return rows.map(row => {
      const event = { id: row.id, userId: row.user_id, createdAt: row.created_at }
      if (row.kind === 'source_revoked') {
        if (row.grant_id === null) throw new Error('Source revocation event is missing its grant')
        return { ...event, kind: row.kind, grantId: row.grant_id }
      }
      return { ...event, kind: row.kind, grantId: null }
    })
  }

  async acknowledge(target: PrereleaseTarget, generationId: string, eventId: string, outcome: 'revoked' | 'deleted' | 'rechecked'): Promise<PrereleaseIdentityReceipt> {
    return this.db.transaction(async (): Promise<PrereleaseIdentityReceipt> => {
      const event = await this.db.prepare(`SELECT kind,acknowledged_at,erasure_operation_id FROM prerelease_identity_events
        WHERE id=? AND target_origin=? AND generation_id=? FOR UPDATE`).get<{ kind: PrereleaseIdentityEvent['kind']; acknowledged_at: number | null; erasure_operation_id: string | null }>(eventId, target.targetOrigin, generationId)
      if (!event) throw new PrereleaseAuthorityError('prerelease_event_not_found', 404)
      if (event.erasure_operation_id !== null && event.acknowledged_at !== null) return { eventId, outcome: 'erased', erasureOperationId: event.erasure_operation_id, completedAt: event.acknowledged_at }
      const expected = event.kind === 'account_deleted' ? 'deleted' : event.kind === 'beta_changed' ? 'rechecked' : 'revoked'
      if (outcome !== expected) throw new PrereleaseAuthorityError('prerelease_acknowledgement_invalid', 400)
      const completedAt = event.acknowledged_at ?? this.now()
      await this.db.prepare('UPDATE prerelease_identity_events SET acknowledged_at=? WHERE id=?').run(completedAt, eventId)
      return { eventId, outcome, completedAt }
    })()
  }
}
