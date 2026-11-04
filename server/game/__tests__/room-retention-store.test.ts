import { afterEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import { RoomRetentionStore } from '../room-retention-store'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function setup() {
  const db = await createTestDatabase()
  cleanups.push(() => db.close())
  await db.prepare("INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES('admin', 'admin', 'Site owner', '', 1)").run()
  return { db, store: new RoomRetentionStore(db) }
}

describe('RoomRetentionStore', () => {
  it('initializes the default three-day waiting and seven-day playing policy', async () => {
    const { db, store } = await setup()
    expect(await store.read()).toEqual({ revision: 1, waitingDays: 3, playingDays: 7, updatedAt: null, updatedBy: null })
    expect(await db.prepare('SELECT * FROM room_retention_policy_audit').all()).toEqual([])
  })

  it('publishes committed changes to another store and audits the actor and prior values', async () => {
    const { db, store } = await setup()
    const other = new RoomRetentionStore(db)
    const result = await store.update({ expectedRevision: 1, waitingDays: 5, playingDays: 14 }, 'admin')
    expect(result).toEqual({ kind: 'updated', policy: {
      revision: 2, waitingDays: 5, playingDays: 14, updatedAt: expect.any(Number), updatedBy: 'Site owner',
    } })
    expect(await other.read()).toEqual(result.policy)
    expect(await db.prepare('SELECT * FROM room_retention_policy_audit').all()).toEqual([{
      revision: 2, previous_revision: 1, previous_waiting_days: 3, previous_playing_days: 7,
      waiting_days: 5, playing_days: 14, actor_user_id: 'admin', created_at: result.policy.updatedAt,
    }])
    expect(result.policy).not.toHaveProperty('updatedByUserId')
  })

  it('allows one of two competing revisions and rejects the stale update without another audit', async () => {
    const { db, store } = await setup()
    const results = await Promise.all([
      store.update({ expectedRevision: 1, waitingDays: 4, playingDays: 10 }, 'admin'),
      new RoomRetentionStore(db).update({ expectedRevision: 1, waitingDays: 6, playingDays: 12 }, 'admin'),
    ])
    expect(results.map(result => result.kind).sort()).toEqual(['conflict', 'updated'])
    expect(results[0].policy).toEqual(results[1].policy)
    expect(await store.read()).toEqual(results[0].policy)
    expect(await db.prepare('SELECT revision FROM room_retention_policy_audit').all()).toEqual([{ revision: 2 }])
  })

  it('rolls the policy back if its audit insert fails', async () => {
    const { db, store } = await setup()
    await db.exec('ALTER TABLE room_retention_policy_audit ADD CONSTRAINT reject_fixture CHECK(waiting_days <> 8)')
    await expect(store.update({ expectedRevision: 1, waitingDays: 8, playingDays: 14 }, 'admin')).rejects.toThrow()
    expect(await store.read()).toEqual({ revision: 1, waitingDays: 3, playingDays: 7, updatedAt: null, updatedBy: null })
    expect(await db.prepare('SELECT * FROM room_retention_policy_audit').all()).toEqual([])
  })

  it.each([0, 91])('rejects out-of-range persisted days %s atomically', async waitingDays => {
    const { db, store } = await setup()
    await expect(store.update({ expectedRevision: 1, waitingDays, playingDays: 7 }, 'admin')).rejects.toThrow()
    expect(await store.read()).toMatchObject({ revision: 1, waitingDays: 3, playingDays: 7 })
    expect(await db.prepare('SELECT * FROM room_retention_policy_audit').all()).toEqual([])
  })

  it('keeps the policy and audit when the modifying account is deleted', async () => {
    const { db, store } = await setup()
    await store.update({ expectedRevision: 1, waitingDays: 4, playingDays: 8 }, 'admin')
    await db.prepare("DELETE FROM users WHERE id='admin'").run()
    expect(await store.read()).toMatchObject({ revision: 2, waitingDays: 4, playingDays: 8, updatedBy: null })
    expect(await db.prepare('SELECT actor_user_id, revision FROM room_retention_policy_audit').all()).toEqual([{ actor_user_id: null, revision: 2 }])
  })
})
