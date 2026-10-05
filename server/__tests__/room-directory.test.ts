import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { RoomDirectory } from '../game/room-directory'
let directory: RoomDirectory
beforeEach(async () => { directory = new RoomDirectory(await createTestDatabase()) })
afterEach(async () => { await directory.db.close() })
const start = async (id: string, port: number, capacity = 30, generation = 'build-one') => {
  await directory.register(id, `http://127.0.0.1:${port}`, generation, capacity)
  await directory.activate(id)
}

it('admits a single instance and reserves one creation destination for duplicate allocations', async () => {
  await start('only', 9001, 1)
  const allocationId = randomUUID()
  const [one, two] = await Promise.all([directory.allocate('alice', allocationId), directory.allocate('alice', allocationId)])
  expect(one).toEqual(two)
  expect(one.wsPath).toBe('/nodes/only/ws')
  await expect(directory.allocate('bob', randomUUID())).rejects.toThrow('capacity')
  const identity = { scopeId: randomUUID(), commandId: randomUUID() }
  const consume = () => directory.db.transaction(() => directory.consumeAllocation('alice', allocationId, identity, 'only'))()
  expect(await consume()).toMatchObject({ roomId: one.roomId, owner: one.owner })
  expect(await consume()).toMatchObject({ roomId: one.roomId, owner: one.owner })
  await expect(directory.db.transaction(() => directory.consumeAllocation('bob', allocationId, identity, 'only'))()).rejects.toThrow('unavailable')
  await expect(directory.db.transaction(() => directory.consumeAllocation('alice', allocationId, { ...identity, commandId: randomUUID() }, 'only'))()).rejects.toThrow('another command')
})

it('places independent rooms across two local instances with bounded admission', async () => {
  await start('a', 9001, 1); await start('b', 9002, 1)
  const rooms = await Promise.all([directory.allocate('one', randomUUID()), directory.allocate('two', randomUUID())])
  expect(rooms.map(room => room.owner.instanceId).sort()).toEqual(['a', 'b'])
  expect(rooms[0]!.roomId).not.toBe(rooms[1]!.roomId)
  await expect(directory.allocate('three', randomUUID())).rejects.toThrow('capacity')
  expect(await directory.claim(rooms[0]!.roomId)).toEqual({ roomId: rooms[0]!.roomId, owner: rooms[0]!.owner, wsPath: rooms[0]!.wsPath })
})

it('preserves increasing epochs across graceful owner release and fences old writes/publications', async () => {
  await start('a', 9001)
  const original = await directory.claim('recorded', 'a')
  await directory.db.transaction(async () => {
    await directory.assertOwner('recorded', original.owner, null)
    await directory.db.prepare("INSERT INTO rooms(id, status, created_at, updated_at) VALUES ('recorded','waiting',1,1)").run()
    await directory.markActive('recorded', original.owner)
  })()
  await directory.stop('a'); await start('b', 9002)
  const current = await directory.claim('recorded', 'b')
  expect(current.owner.epoch).toBe(original.owner.epoch + 1)
  await expect(directory.db.transaction(async () => {
    await directory.assertOwner('recorded', original.owner, 0)
    await directory.db.prepare("UPDATE rooms SET version=99 WHERE id='recorded'").run()
  })()).rejects.toThrow('ownership changed')
  const send = vi.fn()
  await expect(directory.publish('recorded', original.owner, send)).rejects.toThrow('ownership changed')
  expect(send).not.toHaveBeenCalled()
  await directory.publish('recorded', current.owner, send)
  expect(send).toHaveBeenCalledOnce()
  expect(await directory.db.prepare("SELECT version FROM rooms WHERE id='recorded'").get()).toEqual({ version: 0 })
  await expect(directory.db.transaction(() => directory.assertOwner('recorded', current.owner, 1))()).rejects.toThrow('version changed')
  await directory.db.transaction(() => directory.retire('recorded', current.owner))()
  await expect(directory.claim('recorded')).rejects.toThrow('retired')
})

it('will not renew an expired ownership epoch or accept a mixed deployment generation', async () => {
  await start('a', 9001)
  const owner = await directory.claim('logical-expiry', 'a')
  // Logical guard test only, with no application process or fault injection.
  await directory.db.prepare("UPDATE room_ownership SET lease_until=0 WHERE room_id='logical-expiry'").run()
  expect(await directory.heartbeat('a')).toEqual(['logical-expiry'])
  await expect(directory.publish('logical-expiry', owner.owner, () => undefined)).rejects.toThrow('ownership changed')
  const reacquired = await directory.claim('logical-expiry', 'a')
  expect(reacquired.owner.epoch).toBe(owner.owner.epoch + 1)
  await expect(start('b', 9002, 30, 'build-two')).rejects.toThrow('previous deployment generation')
  await directory.stop('a')
  await expect(start('b', 9002, 30, 'build-two')).resolves.toBeUndefined()
})

it('claims each fixed development room only once and excludes it from ordinary admission', async () => {
  await start('a', 9001, 1); await start('b', 9002, 1)
  const first = await directory.claim('dev2', 'a', true)
  await expect(directory.claim('dev2', 'b', true)).rejects.toThrow('another instance')
  expect(await directory.owned('a')).toEqual([{ roomId: 'dev2', owner: first.owner }])
  expect(await directory.owned('b')).toEqual([])
  expect((await directory.allocate('alice', randomUUID())).owner.instanceId).toBe('a')
})

it('shares lobby presence across owners and excludes an earlier owner epoch', async () => {
  await start('a', 9001); await start('b', 9002)
  const create = async (id: string, instance: string, hotseat: number) => {
    const owner = (await directory.claim(id, instance)).owner
    await directory.db.transaction(async () => {
      await directory.db.prepare('INSERT INTO rooms(id, status, created_at, updated_at, hotseat) VALUES (?, ?, 1, 1, ?)').run(id, 'waiting', hotseat)
      await directory.db.prepare("INSERT INTO game_contexts(room_id, lifecycle, created_at, updated_at) VALUES (?, 'active', 1, 1)").run(id)
      await directory.markActive(id, owner)
      await directory.presence(id, owner, 1, 1)
    })()
    return owner
  }
  await create('one', 'a', 0); await create('two', 'b', 0); await create('private', 'b', 1)
  expect((await directory.lobby()).map(room => room.id)).toEqual(['one', 'two'])
  await directory.stop('a')
  const owner = (await directory.claim('one', 'b')).owner
  expect((await directory.lobby()).map(room => room.id)).toEqual(['two'])
  await directory.db.transaction(() => directory.presence('one', owner, 1, 2))()
  expect(await directory.lobby()).toContainEqual({ id: 'one', playerCount: 2, maxPlayers: 2, status: 'playing' })
})

it('reserves a one-for-one replacement when the current owner is at capacity', async () => {
  await start('a', 9001, 1)
  const original = await directory.claim('original', 'a')
  const replacement = await directory.replacement('rematch', 'original', original.owner, false)
  expect(replacement.owner.instanceId).toBe('a')
  await expect(directory.allocate('another', randomUUID())).rejects.toThrow('capacity')
})

it('keeps one development slot owner and allocates a new permanent identity after retirement', async () => {
  await start('a', 9001); await start('b', 9002)
  const original = await directory.claimDevelopment('dev2', 'a')
  expect(original.roomId).toBe('dev2')
  await expect(directory.claimDevelopment('dev2', 'b')).rejects.toThrow('another instance')
  await directory.db.transaction(async () => {
    await directory.db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES (?,'expired',1,1)").run(original.roomId)
    await directory.retire(original.roomId, original.owner)
  })()
  const next = await directory.claimDevelopment('dev2', 'b')
  expect(next.roomId).toMatch(/^dev2-[a-f0-9-]{36}$/)
  expect(next.roomId).not.toBe(original.roomId)
  await expect(directory.claim(original.roomId)).rejects.toThrow('retired')
  expect(await directory.db.prepare('SELECT lifecycle FROM game_contexts WHERE room_id=?').get(original.roomId)).toEqual({ lifecycle: 'expired' })
})

it('collects expired unused allocations and preparation refs while retaining pending commands and active rooms', async () => {
  const { CommandStore } = await import('../game/command-store')
  await start('only', 9001)
  const abandoned = await directory.allocate('abandoned', randomUUID())
  const pending = await directory.allocate('pending', randomUUID())
  const commands = new CommandStore(directory.db)
  const scope = await commands.issueScope('pending')
  const identity = { scopeId: scope.scopeId, commandId: randomUUID() }
  await directory.db.transaction(async () => {
    await directory.consumeAllocation('pending', pending.allocationId, identity, 'only')
    await commands.reserve('pending', identity, null, { type: 'createRoom' }, null, pending.roomId)
  })()
  await directory.db.prepare('UPDATE room_allocations SET expires_at=0').run()
  await directory.db.prepare('UPDATE room_ownership SET lease_until=0').run()
  await directory.db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES('waiting','waiting',1,1)").run()
  await directory.db.prepare("INSERT INTO stored_objects(object_key,content_hash,content_type,size_bytes,state,retain_until,updated_at) VALUES('replay-assets/test',?,'image/png',1,'ready',0,0)").run('a'.repeat(64))
  for (const id of [abandoned.roomId, pending.roomId, 'waiting']) await directory.db.prepare("INSERT INTO object_references VALUES('room-preparation',?,'replay-assets/test')").run(id)
  await directory.cleanup()
  expect(await directory.db.prepare('SELECT room_id FROM room_allocations').all()).toEqual([{ room_id: pending.roomId }])
  expect((await directory.db.prepare('SELECT owner_id FROM object_references ORDER BY owner_id').all<{owner_id:string}>()).map(row => row.owner_id)).toEqual([pending.roomId, 'waiting'].sort())
  expect((await commands.lookup('pending', identity)).kind).toBe('pending')
  await directory.db.prepare('UPDATE command_scopes SET expires_at=0').run()
  await directory.cleanup()
  await commands.cleanup()
  expect(await directory.db.prepare('SELECT room_id FROM room_allocations').all()).toEqual([])
  expect(await directory.db.prepare('SELECT owner_id FROM object_references').all()).toEqual([{ owner_id: 'waiting' }])
  await expect(commands.lookup('pending', identity)).rejects.toThrow(/scope/i)
})
