import { createHash } from 'node:crypto'
import type { PostgresDatabase } from '../../server/database/postgres'
import { canonicalJson } from '../../shared/contract/authoritative-command'

export type RetainedIdentityRef = { userId: string; sourceGrantId: string }
export const compareIdentityRefs = (left: RetainedIdentityRef, right: RetainedIdentityRef): number =>
  left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : left.sourceGrantId < right.sourceGrantId ? -1 : left.sourceGrantId > right.sourceGrantId ? 1 : 0

/** The view is supplied by real pre projection/history persistence, never an empty main stub. */
export async function readRetainedIdentityManifest(db: PostgresDatabase) {
  const exists = await db.prepare("SELECT to_regclass('prerelease_retained_identity_refs') AS name").get<{ name: string | null }>()
  if (!exists?.name) throw new Error('Candidate is missing the retained identity audit view')
  const rows = await db.prepare('SELECT user_id,source_grant_id FROM prerelease_retained_identity_refs LIMIT 100001').all<{ user_id: unknown; source_grant_id: unknown }>()
  if (rows.length > 100000) throw new Error('Retained identity audit exceeds the bounded owner batch budget')
  const refs: RetainedIdentityRef[] = []
  for (const row of rows) {
    if (typeof row.user_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.user_id)
      || typeof row.source_grant_id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(row.source_grant_id)) throw new Error('Retained identity has unbound or invalid authority provenance')
    refs.push({ userId: row.user_id, sourceGrantId: row.source_grant_id })
  }
  const unique = new Map(refs.map(ref => [`${ref.userId}:${ref.sourceGrantId}`, ref]))
  const sorted = [...unique.values()].sort(compareIdentityRefs)
  const missing = await db.prepare(`SELECT id FROM users WHERE NOT EXISTS (
    SELECT 1 FROM prerelease_retained_identity_refs r WHERE r.user_id=users.id) LIMIT 1`).get()
  if (missing) throw new Error('Retained identity audit view omitted an existing principal')
  return { protocolVersion: 1, refs: sorted, identityCount: sorted.length, identityManifestSha256: createHash('sha256').update(canonicalJson(sorted)).digest('hex') }
}
