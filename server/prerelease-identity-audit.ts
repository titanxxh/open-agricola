import { createHash, randomBytes } from 'node:crypto'
import { canonicalJson } from '../shared/contract/authoritative-command'
import type { PrereleaseIdentityState } from '../shared/contract/prerelease-identity'
import type { PostgresDatabase } from './database/postgres'

export type ProjectionRef = { userId: string; sourceGrantId: string }
export type ProjectionAssociation = ProjectionRef & { associationId: string; account: PrereleaseIdentityState['account'] }

export async function associateProjectionRefs(db: PostgresDatabase, targetOrigin: string, generationId: string, refs: ProjectionRef[], now: number): Promise<boolean> {
  for (const ref of refs) {
    const known = await db.prepare('SELECT 1 FROM prerelease_identity_grants WHERE id=? AND user_id=? AND target_origin=?').get(ref.sourceGrantId, ref.userId, targetOrigin)
    if (!known) return false
    if (!await db.prepare('SELECT 1 FROM prerelease_identity_grants WHERE generation_id=? AND user_id=? AND restored_from_grant_id IS NOT NULL').get(generationId, ref.userId)) {
      await db.prepare(`INSERT INTO prerelease_identity_grants(id,user_id,source_token,target_origin,generation_id,created_at,expires_at,revoked_at,restored_from_grant_id)
        VALUES(?,?,NULL,?,?,?,?,?,?)`).run(randomBytes(32).toString('base64url'), ref.userId, targetOrigin, generationId, now, now, now, ref.sourceGrantId)
    }
    await db.prepare(`INSERT INTO prerelease_identity_events(id,target_origin,user_id,grant_id,kind,created_at,generation_id)
      SELECT gen_random_uuid()::text,?,?,NULL,'account_deleted',?,?
      WHERE (NOT EXISTS(SELECT 1 FROM users WHERE id=?) OR EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=?))
        AND NOT EXISTS(SELECT 1 FROM prerelease_identity_events WHERE generation_id=? AND user_id=? AND kind='account_deleted')`)
      .run(targetOrigin, ref.userId, now, generationId, ref.userId, ref.userId, generationId, ref.userId)
  }
  return true
}

export async function projectionAssociations(db: PostgresDatabase, generationId: string, refs: ProjectionRef[]): Promise<ProjectionAssociation[]> {
  const output: ProjectionAssociation[] = []
  for (const ref of refs) {
    const row = await db.prepare(`SELECT g.id,u.username,u.display_name,
      EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=g.user_id) AS deleting
      FROM prerelease_identity_grants g LEFT JOIN users u ON u.id=g.user_id
      WHERE g.generation_id=? AND g.user_id=? AND g.restored_from_grant_id IS NOT NULL`)
      .get<{ id: string; username: string | null; display_name: string | null; deleting: boolean }>(generationId, ref.userId)
    if (!row) throw new Error('Projection association is missing')
    output.push({ ...ref, associationId: row.id, account: row.username !== null && row.display_name !== null && !row.deleting
      ? { kind: 'active', subject: { id: ref.userId, username: row.username, displayName: row.display_name } } : { kind: 'deleted' } })
  }
  return output
}

/** Hash the exact canonical native-view rows expected after cleanup and remapping. */
export async function projectionIdentityManifest(db: PostgresDatabase, generationId: string): Promise<{ identityCount: number; identityManifestSha256: string }> {
  const digest = createHash('sha256').update('[')
  let identityCount = 0
  for (;;) {
    const rows = await db.prepare(`SELECT g.user_id,g.id FROM prerelease_identity_grants g JOIN users u ON u.id=g.user_id
      WHERE g.generation_id=? AND g.restored_from_grant_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=g.user_id)
      ORDER BY g.user_id COLLATE "C",g.id COLLATE "C" LIMIT 100 OFFSET ?`).all<{ user_id: string; id: string }>(generationId, identityCount)
    for (const row of rows) {
      if (identityCount++ > 0) digest.update(',')
      digest.update(canonicalJson({ userId: row.user_id, sourceGrantId: row.id }))
    }
    if (rows.length < 100) break
  }
  return { identityCount, identityManifestSha256: digest.update(']').digest('hex') }
}

export async function finishProjectionErasure(db: PostgresDatabase, generationId: string, operationId: string, now: number): Promise<void> {
  await db.prepare(`UPDATE prerelease_identity_grants g SET projection_erased_at=COALESCE(projection_erased_at,?)
    WHERE g.generation_id=? AND g.restored_from_grant_id IS NOT NULL
      AND (NOT EXISTS(SELECT 1 FROM users WHERE id=g.user_id) OR EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=g.user_id))`).run(now, generationId)
  await db.prepare(`UPDATE prerelease_identity_events e SET acknowledged_at=?,erasure_operation_id=?
    WHERE e.generation_id=? AND e.acknowledged_at IS NULL AND EXISTS(SELECT 1 FROM prerelease_identity_grants g
      WHERE g.generation_id=e.generation_id AND g.user_id=e.user_id AND g.restored_from_grant_id IS NOT NULL AND g.projection_erased_at IS NOT NULL)`)
    .run(now, operationId, generationId)
}
