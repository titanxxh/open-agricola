import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deleteAccount } from '../../server/auth'
import { getDb, initializeDatabase } from '../../server/db'
import type { PostgresDatabase } from '../../server/database/postgres'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
const grant = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const userId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
type Association = { userId: string; sourceGrantId: string; associationId: string; account: { kind: 'deleted' } | { kind: 'active'; subject: { id: string; username: string; displayName: string } } }

/** Owner-validated restore packet remaps privacy provenance, never login rights. */
export async function applyPrereleaseIdentityAudit(db: PostgresDatabase, value: unknown, now = Date.now()): Promise<{ identities: number; erased: number }> {
  if (!object(value) || !uuid(value.generationId) || typeof value.targetId !== 'string' || !/^prerelease-[a-z0-9-]+$/.test(value.targetId)
    || typeof value.targetFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.targetFingerprint) || typeof value.targetOrigin !== 'string'
    || !Array.isArray(value.associations) || value.associations.length > 100000 || !Array.isArray(value.receipts)) throw new Error('Invalid bound identity audit packet')
  const target = new URL(value.targetOrigin)
  if (target.protocol !== 'https:' || target.origin !== value.targetOrigin) throw new Error('Invalid audit origin')
  const generationId = value.generationId
  for (const receipt of value.receipts) {
    if (!object(receipt) || receipt.action !== 'associate' || receipt.generationId !== generationId || receipt.targetOrigin !== value.targetOrigin || receipt.targetId !== value.targetId
      || !uuid(receipt.operationId) || typeof receipt.completedAt !== 'number' || !Number.isSafeInteger(receipt.completedAt)) throw new Error('Invalid source association receipt')
  }
  const associations: Association[] = []
  for (const row of value.associations) {
    if (!object(row) || !userId(row.userId) || !grant(row.sourceGrantId) || !grant(row.associationId) || !object(row.account)) throw new Error('Invalid source association')
    if (row.account.kind === 'deleted') associations.push({ userId: row.userId, sourceGrantId: row.sourceGrantId, associationId: row.associationId, account: { kind: 'deleted' } })
    else if (row.account.kind === 'active' && object(row.account.subject) && row.account.subject.id === row.userId
      && typeof row.account.subject.username === 'string' && row.account.subject.username.length > 0 && row.account.subject.username.length <= 256
      && typeof row.account.subject.displayName === 'string' && row.account.subject.displayName.length > 0 && row.account.subject.displayName.length <= 256) {
      associations.push({ userId: row.userId, sourceGrantId: row.sourceGrantId, associationId: row.associationId, account: { kind: 'active', subject: { id: row.userId, username: row.account.subject.username, displayName: row.account.subject.displayName } } })
    } else throw new Error('Invalid audit account')
  }
  if (new Set(associations.map(row => row.userId)).size !== associations.length) throw new Error('Duplicate identity audit association')
  return db.transaction(async () => {
    await db.prepare('SELECT user_id FROM prerelease_external_identities FOR UPDATE').all()
    const current = await db.prepare('SELECT user_id,source_grant_id FROM prerelease_retained_identity_refs LIMIT 100001')
      .all<{ user_id: string; source_grant_id: string | null }>()
    if (current.length > 100000) throw new Error('Retained identity audit exceeds the bounded owner batch budget')
    if (await db.prepare("SELECT 1 FROM users WHERE identity_origin!='external' LIMIT 1").get()) throw new Error('Audit does not cover every retained principal')
    const byId = new Map(associations.map(row => [row.userId, row]))
    const currentById = new Map(current.map(row => [row.user_id, row]))
    for (const association of associations) if (!currentById.has(association.userId) && !(association.account.kind === 'deleted' && await db.prepare('SELECT 1 FROM prerelease_deleted_subjects WHERE user_id=?').get(association.userId))) throw new Error('Unknown retained identity')
    for (const ref of current) {
      const association = byId.get(ref.user_id)
      if (!association || ref.source_grant_id !== null && ref.source_grant_id !== association.sourceGrantId && ref.source_grant_id !== association.associationId) throw new Error('Unbound retained identity reference')
    }
    for (const association of associations) {
      if (association.account.kind === 'active' && await db.prepare('SELECT 1 FROM prerelease_deleted_subjects WHERE user_id=?').get(association.userId)) throw new Error('Deleted retained identity cannot be recreated')
    }
    // A restored browser Cookie must not become usable in the replacement generation.
    await db.prepare('DELETE FROM prerelease_sessions').run()
    await db.prepare('DELETE FROM prerelease_browser_handoffs').run()
    let erased = 0
    for (const association of associations) {
      if (association.account.kind === 'deleted') {
        await db.prepare('INSERT INTO prerelease_deleted_subjects(user_id,deleted_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(association.userId, now)
        // Removing the last invite must never turn a private room into a public one.
        await db.prepare('DELETE FROM rooms WHERE jsonb_exists(invited_user_ids,?)').run(association.userId)
        await deleteAccount(association.userId, { db, now })
        erased++
      } else {
        await db.prepare(`INSERT INTO users(id,username,display_name,password_hash,created_at,identity_origin)
          VALUES(?,?,?,NULL,?,'external') ON CONFLICT(id) DO UPDATE
          SET username=excluded.username,display_name=excluded.display_name WHERE users.identity_origin='external'`)
          .run(association.userId, association.account.subject.username, association.account.subject.displayName, now)
        await db.prepare(`INSERT INTO prerelease_external_identities(user_id,source_grant_id,generation_id) VALUES(?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET source_grant_id=excluded.source_grant_id,
          generation_id=excluded.generation_id,revision=prerelease_external_identities.revision+1`)
          .run(association.userId, association.associationId, generationId)
      }
    }
    return { identities: associations.length - erased, erased }
  })()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'apply' || !process.argv[3] || process.env.RELEASE_CHANNEL !== 'prerelease' || process.env.PRERELEASE_IDENTITY_SERVICE_KEY) throw new Error('Run only the isolated identity audit tool without identity credentials')
  await initializeDatabase()
  try { process.stdout.write(JSON.stringify(await applyPrereleaseIdentityAudit(getDb(), JSON.parse(readFileSync(process.argv[3], 'utf8')))) + '\n') }
  finally { await getDb().close() }
}
