import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { applyPrereleaseIdentityAudit } from '../../scripts/prerelease/identity-audit'
import { getAccountDeletionRoomIds } from '../auth'
import { ExecutionAccess } from '../game/execution-access'
import { InvalidationStore } from '../invalidation'

it('audits an unbound waiting-only member and includes it in deletion and execution invalidation', async () => {
  const db = await createTestDatabase()
  try {
    const members = [{ memberId: 'waiting-member', userId: 'waiting-only-user', name: 'Waiting farmer', teamIndex: 0, seatCount: 1 }]
    await db.prepare("INSERT INTO rooms(id,status,team_members_json,created_at,updated_at) VALUES('waiting-team','waiting',?::jsonb,1,1)").run(JSON.stringify(members))
    expect(await db.prepare('SELECT user_id,source_grant_id FROM prerelease_retained_identity_refs').all()).toEqual([
      { user_id: 'waiting-only-user', source_grant_id: null },
    ])
    await expect(applyPrereleaseIdentityAudit(db, { generationId: randomUUID(), targetId: 'prerelease-main', targetFingerprint: 'a'.repeat(64),
      targetOrigin: 'https://pre.example.test', associations: [], receipts: [],
    })).rejects.toThrow('Unbound retained identity reference')
    expect(await getAccountDeletionRoomIds('waiting-only-user', db)).toEqual(['waiting-team'])
    const access = new ExecutionAccess(db), before = await access.capture([], ['waiting-only-user'])
    const operation = await new InvalidationStore(db).begin('user', 'waiting-only-user', async () => {})
    expect(operation.roomIds).toEqual(['waiting-team'])
    await expect(access.check(before)).rejects.toThrow('invalidated')
    expect(await db.prepare('SELECT id FROM rooms').all()).toEqual([])
    expect(await db.prepare('SELECT user_id FROM prerelease_retained_identity_refs').all()).toEqual([])
  } finally { await db.close() }
})
