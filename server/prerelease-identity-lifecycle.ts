import { createHash } from 'node:crypto'
import { PRERELEASE_IDENTITY_FRESHNESS_MS, type PrereleaseGenerationView, type PrereleaseOwnerReceipt } from '../shared/contract/prerelease-identity'
import type { PostgresDatabase } from './database/postgres'
import { associateProjectionRefs, finishProjectionErasure, projectionAssociations, projectionIdentityManifest, type ProjectionRef } from './prerelease-identity-audit'

export type PrereleaseGenerationRow = {
  id: string; target_origin: string; target_id: string; is_current: boolean; admission_open: boolean; prepared_at: number; retired_at: number | null; audit_operation_id: string | null
}
type OperationRow = {
  operation_id: string; generation_id: string; target_origin: string; target_id: string; action: PrereleaseOwnerReceipt['action']
  request_hash: string; completed_at: number; purge_receipt_sha256: string | null
  audit_operation_id: string | null; identity_manifest_sha256: string | null; identity_count: number | null; verification_receipt_sha256: string | null
}
type OwnerBinding = { targetOrigin: string; generationId: string; operationId: string }
export type PrereleaseOwnerRequest = OwnerBinding & (
  | { action: 'prepare'; targetId: string; expectedPreviousGenerationId: string | null }
  | { action: 'close' }
  | { action: 'activate'; auditOperationId: string }
  | { action: 'associate'; refs: ProjectionRef[] }
  | { action: 'audit-complete'; identityManifestSha256: string; identityCount: number; verificationReceiptSha256: string }
  | { action: 'retire'; purgeReceiptSha256: string }
)

export class PrereleaseLifecycleError extends Error {
  readonly status: number
  readonly code: string
  constructor(code: string, status = 409) { super(code); this.code = code; this.status = status }
}

/** Also acquired by source-revocation triggers: erase and future cleanup cannot pass one another. */
export async function lockPrereleaseIdentity(db: PostgresDatabase): Promise<void> {
  await db.exec("SELECT pg_advisory_xact_lock(hashtextextended('open-agricola:prerelease-identity',0))")
}

export function currentPrereleaseGeneration(db: PostgresDatabase, targetOrigin: string) {
  return db.prepare('SELECT * FROM prerelease_identity_generations WHERE target_origin=? AND is_current').get<PrereleaseGenerationRow>(targetOrigin)
}

function receipt(row: OperationRow): PrereleaseOwnerReceipt {
  const binding = { operationId: row.operation_id, generationId: row.generation_id, targetOrigin: row.target_origin, targetId: row.target_id, completedAt: row.completed_at }
  if (row.action === 'retire') {
    if (row.purge_receipt_sha256 === null) throw new Error('Retirement receipt is missing its purge proof')
    return { ...binding, action: row.action, purgeReceiptSha256: row.purge_receipt_sha256 }
  }
  if (row.action === 'activate') {
    if (row.audit_operation_id === null) throw new Error('Activation is missing its identity audit')
    return { ...binding, action: row.action, auditOperationId: row.audit_operation_id }
  }
  if (row.action === 'audit-complete') {
    if (row.identity_manifest_sha256 === null || row.identity_count === null || row.verification_receipt_sha256 === null) throw new Error('Identity audit receipt is incomplete')
    return { ...binding, action: row.action, identityManifestSha256: row.identity_manifest_sha256, identityCount: row.identity_count, verificationReceiptSha256: row.verification_receipt_sha256 }
  }
  return { ...binding, action: row.action }
}

const operations = `SELECT o.*, g.target_origin, g.target_id FROM prerelease_identity_owner_operations o
  JOIN prerelease_identity_generations g ON g.id=o.generation_id`

export class PrereleaseIdentityLifecycle {
  readonly db: PostgresDatabase
  readonly now: () => number
  constructor(db: PostgresDatabase, now: () => number = Date.now) { this.db = db; this.now = now }

  async read(targetOrigin: string, generationId?: string): Promise<PrereleaseGenerationView | null> {
    const row = generationId
      ? await this.db.prepare('SELECT * FROM prerelease_identity_generations WHERE id=? AND target_origin=?').get<PrereleaseGenerationRow>(generationId, targetOrigin)
      : await currentPrereleaseGeneration(this.db, targetOrigin)
    if (!row) return null
    let audit: (PrereleaseOwnerReceipt & { action: 'audit-complete' }) | null = null
    if (row.audit_operation_id !== null) {
      const saved = await this.db.prepare(`${operations} WHERE o.operation_id=? AND o.generation_id=?`).get<OperationRow>(row.audit_operation_id, row.id)
      const found = saved && receipt(saved)
      if (!found || found.action !== 'audit-complete') throw new Error('Generation identity audit is missing')
      audit = found
    }
    const common = { audit, generationId: row.id, targetOrigin: row.target_origin, targetId: row.target_id, isCurrent: row.is_current, preparedAt: row.prepared_at }
    if (row.retired_at !== null) {
      const retired = await this.db.prepare(`${operations} WHERE o.generation_id=? AND o.action='retire'`).get<OperationRow>(row.id)
      if (!retired) throw new Error('Retired generation is missing its receipt')
      const retirement = receipt(retired)
      if (retirement.action !== 'retire') throw new Error('Invalid retirement receipt')
      return { ...common, state: 'retired', retirement }
    }
    if (row.admission_open) {
      if (!audit) throw new Error('Open generation is missing its identity audit')
      return { ...common, state: 'open', audit, retirement: null }
    }
    return { ...common, state: 'closed', retirement: null }
  }

  async associations(generationId: string, refs: ProjectionRef[]) {
    return projectionAssociations(this.db, generationId, refs)
  }

  async apply(input: PrereleaseOwnerRequest, configuredTargetOrigin: string | undefined): Promise<PrereleaseOwnerReceipt> {
    const requestHash = createHash('sha256').update(JSON.stringify([
      input.action, input.targetOrigin, input.generationId, input.operationId,
      input.action === 'prepare' ? input.targetId : null,
      input.action === 'prepare' ? input.expectedPreviousGenerationId : null,
      input.action === 'retire' ? input.purgeReceiptSha256 : null,
      input.action === 'activate' ? input.auditOperationId : null,
      input.action === 'associate' ? input.refs : null,
      input.action === 'audit-complete' ? [input.identityManifestSha256,input.identityCount,input.verificationReceiptSha256] : null,
    ])).digest('hex')
    return this.db.transaction(async () => {
      await lockPrereleaseIdentity(this.db)
      const previous = await this.db.prepare(`${operations} WHERE o.operation_id=?`).get<OperationRow>(input.operationId)
      if (previous) {
        if (previous.request_hash !== requestHash) throw new PrereleaseLifecycleError('prerelease_operation_conflict')
        return receipt(previous)
      }
      const now = this.now()
      let generation = await currentPrereleaseGeneration(this.db, input.targetOrigin)
      if (input.action === 'prepare') {
        if (input.targetOrigin !== configuredTargetOrigin) throw new PrereleaseLifecycleError('prerelease_target_invalid', 400)
        if ((generation?.id ?? null) !== input.expectedPreviousGenerationId || (generation && generation.retired_at === null)) {
          throw new PrereleaseLifecycleError('prerelease_generation_conflict')
        }
        if (await this.db.prepare('SELECT 1 FROM prerelease_identity_generations WHERE id=?').get(input.generationId)) throw new PrereleaseLifecycleError('prerelease_generation_reused')
        await this.db.prepare('UPDATE prerelease_identity_generations SET is_current=false WHERE target_origin=? AND is_current').run(input.targetOrigin)
        await this.db.prepare(`INSERT INTO prerelease_identity_generations(id,target_origin,target_id,prepared_at)
          VALUES(?,?,?,?)`).run(input.generationId, input.targetOrigin, input.targetId, now)
        generation = await currentPrereleaseGeneration(this.db, input.targetOrigin)
      } else {
        generation = await this.db.prepare('SELECT * FROM prerelease_identity_generations WHERE id=? AND target_origin=?').get<PrereleaseGenerationRow>(input.generationId, input.targetOrigin)
        if (!generation) throw new PrereleaseLifecycleError('prerelease_generation_not_found', 404)
        if (input.action === 'retire' && generation.retired_at !== null) {
          const retired = await this.db.prepare(`${operations} WHERE o.generation_id=? AND o.action='retire'`).get<OperationRow>(generation.id)
          if (!retired || retired.purge_receipt_sha256 !== input.purgeReceiptSha256) throw new PrereleaseLifecycleError('prerelease_retirement_conflict')
          return receipt(retired)
        }
        if (generation.retired_at !== null || !generation.is_current) throw new PrereleaseLifecycleError('prerelease_generation_conflict')
        if (input.action === 'activate') {
          if (input.targetOrigin !== configuredTargetOrigin) throw new PrereleaseLifecycleError('prerelease_target_invalid', 400)
          const audit = generation.audit_operation_id && await this.db.prepare(`${operations} WHERE o.operation_id=? AND o.generation_id=? AND o.action='audit-complete'`).get<OperationRow>(generation.audit_operation_id, generation.id)
          if (!audit || input.auditOperationId !== audit.operation_id || audit.completed_at > now || now >= audit.completed_at + PRERELEASE_IDENTITY_FRESHNESS_MS) throw new PrereleaseLifecycleError('prerelease_identity_audit_required')
          const manifest = await projectionIdentityManifest(this.db, generation.id)
          if (manifest.identityCount !== audit.identity_count || manifest.identityManifestSha256 !== audit.identity_manifest_sha256
            || await this.db.prepare(`SELECT 1 FROM prerelease_identity_events WHERE generation_id=? AND kind='account_deleted' AND acknowledged_at IS NULL LIMIT 1`).get(generation.id)) throw new PrereleaseLifecycleError('prerelease_identity_audit_changed')
          await this.db.prepare('UPDATE prerelease_identity_generations SET admission_open=true WHERE id=?').run(generation.id)
        } else if (input.action === 'close') {
          await this.db.prepare('UPDATE prerelease_identity_generations SET admission_open=false,audit_operation_id=NULL WHERE id=?').run(generation.id)
        } else if (generation.admission_open) throw new PrereleaseLifecycleError('prerelease_generation_must_be_closed')
      }
      if (!generation) throw new Error('Generation preparation did not commit')
      if (input.action === 'associate') {
        if (!await associateProjectionRefs(this.db, input.targetOrigin, generation.id, input.refs, now)) throw new PrereleaseLifecycleError('prerelease_identity_reference_unknown', 400)
        await this.db.prepare('UPDATE prerelease_identity_generations SET audit_operation_id=NULL WHERE id=?').run(generation.id)
      } else if (input.action === 'audit-complete') {
        const manifest = await projectionIdentityManifest(this.db, generation.id)
        if (manifest.identityCount !== input.identityCount || manifest.identityManifestSha256 !== input.identityManifestSha256) throw new PrereleaseLifecycleError('prerelease_identity_audit_changed')
      }
      await this.db.prepare(`INSERT INTO prerelease_identity_owner_operations(operation_id,generation_id,action,request_hash,completed_at,purge_receipt_sha256,audit_operation_id,identity_manifest_sha256,identity_count,verification_receipt_sha256)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(input.operationId, generation.id, input.action, requestHash, now,
          input.action === 'retire' ? input.purgeReceiptSha256 : null, input.action === 'activate' ? input.auditOperationId : null,
          input.action === 'audit-complete' ? input.identityManifestSha256 : null, input.action === 'audit-complete' ? input.identityCount : null,
          input.action === 'audit-complete' ? input.verificationReceiptSha256 : null)
      if (input.action === 'audit-complete') {
        await finishProjectionErasure(this.db, generation.id, input.operationId, now)
        await this.db.prepare('UPDATE prerelease_identity_generations SET audit_operation_id=? WHERE id=?').run(input.operationId, generation.id)
      }
      if (input.action === 'retire') {
        await this.db.prepare('UPDATE prerelease_identity_generations SET admission_open=false,retired_at=? WHERE id=?').run(now, generation.id)
        await this.db.prepare('UPDATE prerelease_identity_grants SET revoked_at=COALESCE(revoked_at,?),projection_erased_at=? WHERE generation_id=?').run(now, now, generation.id)
        await this.db.prepare('DELETE FROM prerelease_identity_handoffs WHERE generation_id=?').run(generation.id)
        await this.db.prepare(`UPDATE prerelease_identity_events SET acknowledged_at=?,erasure_operation_id=?
          WHERE generation_id=? AND acknowledged_at IS NULL`).run(now, input.operationId, generation.id)
      }
      const saved = await this.db.prepare(`${operations} WHERE o.operation_id=?`).get<OperationRow>(input.operationId)
      if (!saved) throw new Error('Owner operation did not commit')
      return receipt(saved)
    })()
  }
}
