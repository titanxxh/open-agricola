import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { RoomDirectory } from '../game/room-directory'
import { InvalidationStore } from '../invalidation'
import { SandboxAuthority } from '../game/sandbox-authority'
let store: InvalidationStore
let directory: RoomDirectory
beforeEach(async () => {
  store = new InvalidationStore(await createTestDatabase())
  directory = new RoomDirectory(store.db)
  for (const [id, port] of [['a', 9101], ['b', 9102]] as const) {
    await directory.register(id, `http://127.0.0.1:${port}`, 'test')
    await directory.activate(id)
  }
})
afterEach(async () => { await store.db.close() })

it('persists the card barrier and lifecycle before reporting pending, then waits for both independent workers', async () => {
  const owner = (await directory.claim('recorded', 'b')).owner
  await store.db.prepare(`INSERT INTO rooms(id,status,custom_card_ids,created_at,updated_at) VALUES ('recorded','waiting','["card"]',1,1)`).run()
  await store.db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES ('recorded','active',1,1)").run()
  await store.db.transaction(() => directory.markActive('recorded', owner))()
  const sandbox = new SandboxAuthority(directory, 'b')
  const old = await store.access.capture(['card'])
  const response = vi.fn()
  await sandbox.publish(old, response)
  const mutate = vi.fn(async () => {})
  const operation = await store.begin('card', 'card', mutate)
  expect(mutate).toHaveBeenCalledOnce()
  expect(operation.roomIds).toEqual(['recorded'])
  expect(await store.db.prepare("SELECT lifecycle FROM game_contexts WHERE room_id='recorded'").get()).toEqual({ lifecycle: 'expired' })
  await expect(store.db.transaction(() => directory.assertOwner('recorded', owner))()).rejects.toThrow('ownership changed')
  await expect(sandbox.publish(old, response)).rejects.toThrow('invalidated')
  expect(response).toHaveBeenCalledOnce()
  expect(await store.status(operation.id)).toMatchObject({ pending: true })
  const duplicate = await store.begin('card', 'card', mutate)
  expect(duplicate.id).toBe(operation.id); expect(mutate).toHaveBeenCalledOnce()
  const execute = vi.fn(async () => {})
  await Promise.all([store.drain('a', execute), store.drain('a', execute)])
  expect(execute).toHaveBeenCalledOnce()
  expect(await store.status(operation.id)).toMatchObject({ pending: true })
  await store.drain('b', execute)
  expect(execute).toHaveBeenCalledTimes(2)
  expect(await store.status(operation.id)).toMatchObject({ pending: false })
  // A newly opened author sandbox may use the new draft generation.
  await sandbox.publish(await store.access.capture(['card']), response)
  expect(response).toHaveBeenCalledTimes(2)
})

it('rolls back the invalidation generation, operation, and lifecycle if the platform mutation rejects', async () => {
  const stamp = await store.access.capture(['missing'])
  await expect(store.begin('card', 'missing', async () => { throw new Error('Card not found') })).rejects.toThrow('Card not found')
  await store.access.check(stamp)
  expect(await store.db.prepare('SELECT count(*)::bigint AS count FROM invalidation_operations').get()).toEqual({ count: 0 })
})

it('accepts a normal stopped instance as disqualified and prevents its sandbox from publishing', async () => {
  const operation = await store.begin('card', 'card', async () => {})
  await store.drain('a', async () => {})
  const sandbox = new SandboxAuthority(directory, 'b')
  const stamp = await store.access.capture(['card'])
  await directory.stop('b')
  expect(await store.status(operation.id)).toMatchObject({ pending: false })
  await expect(sandbox.publish(stamp, () => {})).rejects.toThrow('lease ended')
})

it('claims account cleanup once across workers and refuses a superseded completion', async () => {
  const database = await import('../db')
  const auth = await import('../auth')
  vi.spyOn(database, 'getDb').mockReturnValue(store.db)
  try {
    const user = await auth.createLocalUserForTests('deletion_fixture', 'fixture-password')
    const operation = await store.begin('user', user.id, () => auth.requestAccountDeletion(user.id))
    await store.drain('a', async () => {}); await store.drain('b', async () => {})
    expect(await store.status(operation.id)).toMatchObject({ pending: false })
    const claims = await Promise.all([auth.claimPendingAccountDeletion(), auth.claimPendingAccountDeletion()])
    expect(claims.filter(Boolean)).toHaveLength(1)
    const claim = claims.find(value => value !== null)!
    expect(await auth.renewAccountDeletion(claim)).toBe(true)
    expect(await auth.finishAccountDeletion({ ...claim, token: 'another-worker' })).toBe(false)
    expect(await auth.finishAccountDeletion(claim)).toBe(true)
    expect(await store.db.prepare('SELECT 1 FROM users WHERE id=?').get(user.id)).toBeUndefined()
  } finally { vi.restoreAllMocks() }
})
