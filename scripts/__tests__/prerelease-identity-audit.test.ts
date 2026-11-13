import { createHash } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { createTestDatabase } from '../../server/__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../server/database/postgres'
import { readRetainedIdentityManifest } from '../prerelease/identity-manifest'
import { deleteAccount } from '../../server/auth'
import { parseRoomAccess } from '../../server/game/room-access'
import { applyPrereleaseIdentityAudit } from '../prerelease/identity-audit'
import { PrereleaseIdentityLifecycle } from '../../server/prerelease-identity-lifecycle'

const databases: PostgresDatabase[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.close())) })

async function externalPrincipal(db: PostgresDatabase, id: string, sourceGrantId: string) {
  await db.prepare(`INSERT INTO users(id,username,display_name,password_hash,created_at,identity_origin)
    VALUES(?,?,?,NULL,1000,'external')`).run(id, id, id)
  await db.prepare('INSERT INTO prerelease_external_identities(user_id,source_grant_id,generation_id) VALUES(?,?,?)')
    .run(id, sourceGrantId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
}

async function sourceAssociation(id: string, active: boolean) {
  const db = await createTestDatabase(); databases.push(db)
  const targetOrigin = 'https://pre.example.test'
  const generationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const sourceGeneration = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const sourceGrantId = 'S'.repeat(43)
  if (active) await db.prepare(`INSERT INTO users(id,username,display_name,password_hash,created_at)
    VALUES(?,?,?,'unused-local-hash',1000)`).run(id, `source_${id}`, 'Current source name')
  await db.prepare(`INSERT INTO prerelease_identity_generations(id,target_origin,target_id,prepared_at,is_current)
    VALUES(?,?,'prerelease-audit',1000,false),(?,?,'prerelease-audit',2000,true)`)
    .run(sourceGeneration, targetOrigin, generationId, targetOrigin)
  await db.prepare(`INSERT INTO prerelease_identity_grants(id,user_id,source_token,target_origin,generation_id,created_at,expires_at,revoked_at)
    VALUES(?,?,NULL,?,?,1000,1500,1500)`).run(sourceGrantId, id, targetOrigin, sourceGeneration)
  const lifecycle = new PrereleaseIdentityLifecycle(db, () => 3000)
  const refs = [{ userId: id, sourceGrantId }]
  const receipt = await lifecycle.apply({ action: 'associate', targetOrigin, generationId,
    operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', refs }, targetOrigin)
  const associations = await lifecycle.associations(generationId, refs)
  expect(await db.prepare('SELECT source_token,expires_at,revoked_at FROM prerelease_identity_grants WHERE id=?')
    .get(associations[0]?.associationId)).toEqual({ source_token: null, expires_at: 3000, revoked_at: 3000 })
  return { generationId, targetId: 'prerelease-audit', targetOrigin, targetFingerprint: 'f'.repeat(64), receipts: [receipt], associations }
}

async function retainedResult(db: PostgresDatabase, id: string) {
  await db.prepare(`INSERT INTO game_results(room_id,started_at,finished_at,rounds_played,player_count,
    enable_community_deck,enable_parent_cards,enable_through_the_seasons,enable_farmers_of_the_moor)
    VALUES('native-history',500,1000,14,2,0,0,0,0)`).run()
  await db.prepare(`INSERT INTO game_result_players(room_id,player_index,game_player_id,user_id,display_name,score)
    VALUES('native-history',0,'game-player-0',?,'Retained player',42)`).run(id)
}

it('refuses a native invitation retained after the invited account and projection are deleted', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await externalPrincipal(db, 'owner', 'O'.repeat(43))
  await externalPrincipal(db, 'invitee', 'I'.repeat(43))
  const access = await parseRoomAccess({ kind: 'invited', invitedUserIds: ['invitee'] },
    { creatorId: 'owner', maxPlayers: 2, hotseat: false }, db)
  expect(access).toEqual({ ok: true, access: { kind: 'invited', invitedUserIds: ['invitee'] } })
  await db.prepare('INSERT INTO rooms(id,created_by,created_at,updated_at,invited_user_ids) VALUES(?,?,1000,1000,?::jsonb)')
    .run('native-invitation', 'owner', JSON.stringify(['invitee']))
  await deleteAccount('invitee', { db, now: 2000 })
  expect(await db.prepare('SELECT id FROM users WHERE id=?').get('invitee')).toBeUndefined()
  expect(await db.prepare('SELECT invited_user_ids FROM rooms WHERE id=?').get('native-invitation'))
    .toEqual({ invited_user_ids: ['invitee'] })
  await expect(readRetainedIdentityManifest(db)).rejects.toThrow('unbound or invalid authority provenance')
})

it('refuses a native result account reference without an account or projection', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await externalPrincipal(db, 'history-subject', 'H'.repeat(43))
  await retainedResult(db, 'history-subject')
  await db.prepare('DELETE FROM users WHERE id=?').run('history-subject')
  expect(await db.prepare('SELECT user_id FROM game_result_players WHERE room_id=?').get('native-history'))
    .toEqual({ user_id: 'history-subject' })
  await expect(readRetainedIdentityManifest(db)).rejects.toThrow('unbound or invalid authority provenance')
})

it('remaps an active history-only account through an actual source-verified privacy association without login rights', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await retainedResult(db, 'history-subject')
  const packet = await sourceAssociation('history-subject', true)
  expect(await applyPrereleaseIdentityAudit(db, packet, 4000)).toEqual({ identities: 1, erased: 0 })
  expect(await db.prepare('SELECT id,identity_origin,password_hash,email FROM users').all())
    .toEqual([{ id: 'history-subject', identity_origin: 'external', password_hash: null, email: null }])
  expect((await readRetainedIdentityManifest(db)).refs)
    .toEqual([{ userId: 'history-subject', sourceGrantId: packet.associations[0]?.associationId }])
  expect(await db.prepare('SELECT user_id,score FROM game_result_players').all())
    .toEqual([{ user_id: 'history-subject', score: 42 }])
  expect(await db.prepare('SELECT token_hash FROM prerelease_sessions').all()).toEqual([])
  expect(await db.prepare('SELECT token FROM sessions').all()).toEqual([])
  expect(await applyPrereleaseIdentityAudit(db, packet, 4001)).toEqual({ identities: 1, erased: 0 })
})

it('erases a deleted invite/history-only account through source verification and rescans to an empty native set', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await retainedResult(db, 'deleted-subject')
  await db.prepare(`INSERT INTO rooms(id,created_at,updated_at,invited_user_ids)
    VALUES('private-room',1000,1000,'["deleted-subject"]')`).run()
  const packet = await sourceAssociation('deleted-subject', false)
  expect(await applyPrereleaseIdentityAudit(db, packet, 4000)).toEqual({ identities: 0, erased: 1 })
  expect(await db.prepare('SELECT id FROM rooms').all()).toEqual([])
  expect(await db.prepare('SELECT user_id,display_name,score FROM game_result_players').all())
    .toEqual([{ user_id: null, display_name: 'Deleted player (seat 1)', score: 42 }])
  expect((await readRetainedIdentityManifest(db)).refs).toEqual([])
  expect(await applyPrereleaseIdentityAudit(db, packet, 4001)).toEqual({ identities: 0, erased: 1 })
})

it('requires every native orphan to be audited and refuses to recreate an erased subject', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await retainedResult(db, 'history-subject')
  const packet = await sourceAssociation('history-subject', true)
  await expect(applyPrereleaseIdentityAudit(db, { ...packet, associations: [] }, 4000))
    .rejects.toThrow('Unbound retained identity reference')
  await db.prepare('INSERT INTO prerelease_deleted_subjects(user_id,deleted_at) VALUES(?,2000)').run('history-subject')
  await expect(applyPrereleaseIdentityAudit(db, packet, 4000)).rejects.toThrow('cannot be recreated')
  expect(await db.prepare('SELECT id FROM users').all()).toEqual([])
  expect(await db.prepare('SELECT user_id FROM game_result_players').all()).toEqual([{ user_id: 'history-subject' }])
})

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
  await expect(readRetainedIdentityManifest(db)).rejects.toThrow('unbound or invalid authority provenance')
})

it('does not mistake a game player ID, display name or arbitrary card userId for an account reference', async () => {
  const db = await createTestDatabase(); databases.push(db)
  await db.prepare(`INSERT INTO rooms(id,created_at,updated_at,state_json,custom_cards_runtime_json)
    VALUES('anonymous-game',1000,1000,?,?)`)
    .run(JSON.stringify({ state: { players: [{ id: 'game-player', name: 'Display name' }] } }),
      JSON.stringify([{ cardStates: { userId: 'card-private-value' } }]))
  expect((await readRetainedIdentityManifest(db)).refs).toEqual([])
})
