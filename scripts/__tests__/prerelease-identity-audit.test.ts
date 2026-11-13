import { createHash } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { createTestDatabase } from '../../server/__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../server/database/postgres'
import { readRetainedIdentityManifest } from '../prerelease/identity-manifest'

const databases: PostgresDatabase[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.close())) })

it('fails closed on a candidate without the required real identity/history view', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await db.exec('DROP VIEW prerelease_retained_identity_refs')
  await expect(readRetainedIdentityManifest(db)).rejects.toThrow('retained identity audit view')
})

it('reads distinct real SQL rows in canonical order and rejects unbound provenance', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await db.exec('DROP VIEW prerelease_retained_identity_refs; CREATE TABLE pre_audit_fixture(user_id text,source_grant_id text); CREATE VIEW prerelease_retained_identity_refs AS SELECT * FROM pre_audit_fixture')
  await db.prepare('INSERT INTO pre_audit_fixture VALUES (?,?),(?,?),(?,?)').run('u2', 'B'.repeat(43), 'u1', 'A'.repeat(43), 'u1', 'A'.repeat(43))
  const result = await readRetainedIdentityManifest(db)
  expect(result.refs).toEqual([{ userId: 'u1', sourceGrantId: 'A'.repeat(43) }, { userId: 'u2', sourceGrantId: 'B'.repeat(43) }])
  expect(result.identityManifestSha256).toBe(createHash('sha256').update(`[{"sourceGrantId":"${'A'.repeat(43)}","userId":"u1"},{"sourceGrantId":"${'B'.repeat(43)}","userId":"u2"}]`).digest('hex'))
  await db.prepare('INSERT INTO pre_audit_fixture VALUES (?,NULL)').run('unbound-history-subject')
  await expect(readRetainedIdentityManifest(db)).rejects.toThrow('unbound')
})


it('audits the native external projection and refuses an existing principal without provenance', async () => {
  const db = await createTestDatabase(); databases.push(db)
  const expected = [{ userId: 'u1', sourceGrantId: 'A'.repeat(43) }, { userId: 'u2', sourceGrantId: 'B'.repeat(43) }]
  for (const ref of [...expected].reverse()) {
    await db.prepare(`INSERT INTO users(id,username,display_name,password_hash,created_at,identity_origin)
      VALUES(?,?,?,NULL,1000,'external')`).run(ref.userId, `audit_${ref.userId}`, `Farmer ${ref.userId}`)
    await db.prepare('INSERT INTO prerelease_external_identities(user_id,source_grant_id,generation_id) VALUES(?,?,?)')
      .run(ref.userId, ref.sourceGrantId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  }
  expect(await readRetainedIdentityManifest(db)).toEqual({
    protocolVersion: 1, refs: expected, identityCount: 2,
    identityManifestSha256: createHash('sha256').update(`[{"sourceGrantId":"${'A'.repeat(43)}","userId":"u1"},{"sourceGrantId":"${'B'.repeat(43)}","userId":"u2"}]`).digest('hex'),
  })
  await db.prepare('UPDATE prerelease_external_identities SET source_grant_id=? WHERE user_id=?').run('unbound', 'u2')
  await expect(readRetainedIdentityManifest(db)).rejects.toThrow('unbound or invalid authority provenance')
  await db.prepare('UPDATE prerelease_external_identities SET source_grant_id=? WHERE user_id=?').run('B'.repeat(43), 'u2')
  await db.prepare('DELETE FROM prerelease_external_identities WHERE user_id=?').run('u2')
  await expect(readRetainedIdentityManifest(db)).rejects.toThrow('omitted an existing principal')
})
