import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { RoomDirectory } from '../game/room-directory'
import { CommandStore } from '../game/command-store'
import { discoverRoom } from '../game/room-discovery'
let directory: RoomDirectory
beforeAll(async () => {
  directory = new RoomDirectory(await createTestDatabase())
  await directory.register('a', 'http://127.0.0.1:9001', 'test'); await directory.activate('a')
})
afterAll(async () => { await directory.db.close() })

it('discovers an idempotent creation allocation without creating a Room', async () => {
  const input = { allocationId: randomUUID() }
  expect(await discoverRoom(directory, 'alice', input)).toEqual(await discoverRoom(directory, 'alice', input))
  expect(await directory.db.prepare('SELECT 1 FROM rooms').get()).toBeUndefined()
})

it('uses a rematch receipt before looking up the retired original Room and keeps receipt access private', async () => {
  const commands = new CommandStore(directory.db)
  const scope = await commands.issueScope('alice')
  const identity = { scopeId: scope.scopeId, commandId: randomUUID() }
  const result = await commands.reserve('alice', identity, 'old-room', { type: 'newGame' })
  if (result.kind !== 'pending') throw new Error('Expected pending command')
  const newRoom = result.request.resultRoomId!
  await directory.db.transaction(async () => {
    await directory.db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES ('old-room','expired',1,1), (?,'active',1,1)").run(newRoom)
    await commands.complete(result.request, { ok: true, roomId: newRoom, roomVersion: 0 })
  })()
  expect(await discoverRoom(directory, 'alice', { roomId: 'old-room', pendingIdentity: identity })).toEqual({ roomId: newRoom, wsPath: '/nodes/a/ws' })
  await expect(discoverRoom(directory, 'bob', { roomId: 'old-room', pendingIdentity: identity })).rejects.toMatchObject({ code: 'command_scope_expired' })
  await expect(discoverRoom(directory, 'alice', { roomId: 'old-room' })).rejects.toMatchObject({ code: 'context_changed' })
})

it('allows querying a failed creation receipt without reserving another destination', async () => {
  const commands = new CommandStore(directory.db)
  const scope = await commands.issueScope('creator')
  const identity = { scopeId: scope.scopeId, commandId: randomUUID() }
  const reserved = await commands.reserve('creator', identity, null, { type: 'createRoom' })
  if (reserved.kind !== 'pending') throw new Error('Expected reservation')
  await directory.db.transaction(() => commands.complete(reserved.request, { ok: false, error: 'Card unavailable' }))()
  const before = await directory.db.prepare('SELECT count(*) AS count FROM room_allocations').get()
  expect(await discoverRoom(directory, 'creator', { pendingIdentity: identity })).toEqual({ wsPath: '/nodes/a/ws' })
  expect(await directory.db.prepare('SELECT count(*) AS count FROM room_allocations').get()).toEqual(before)
})
