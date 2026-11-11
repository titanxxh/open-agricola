import { createHash } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { createTestDatabase } from '../../server/__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../server/database/postgres'
import { readRetainedIdentityManifest } from '../prerelease/identity-manifest'

const databases: PostgresDatabase[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.close())) })

it('fails closed on a candidate without the required real identity/history view', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await expect(readRetainedIdentityManifest(db)).rejects.toThrow('retained identity audit view')
})

it('reads distinct real SQL rows in canonical order and rejects unbound provenance', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await db.exec('CREATE TABLE pre_audit_fixture(user_id text,source_grant_id text); CREATE VIEW prerelease_retained_identity_refs AS SELECT * FROM pre_audit_fixture')
  await db.prepare('INSERT INTO pre_audit_fixture VALUES (?,?),(?,?),(?,?)').run('u2', 'B'.repeat(43), 'u1', 'A'.repeat(43), 'u1', 'A'.repeat(43))
  const result = await readRetainedIdentityManifest(db)
  expect(result.refs).toEqual([{ userId: 'u1', sourceGrantId: 'A'.repeat(43) }, { userId: 'u2', sourceGrantId: 'B'.repeat(43) }])
  expect(result.identityManifestSha256).toBe(createHash('sha256').update(`[{"sourceGrantId":"${'A'.repeat(43)}","userId":"u1"},{"sourceGrantId":"${'B'.repeat(43)}","userId":"u2"}]`).digest('hex'))
  await db.prepare('INSERT INTO pre_audit_fixture VALUES (?,NULL)').run('unbound-history-subject')
  await expect(readRetainedIdentityManifest(db)).rejects.toThrow('unbound')
})
