import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
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

it('expires an unclaimed cold game before discovery can reserve fresh capacity for it', async () => {
  const roomId = randomUUID()
  await directory.db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES(?,'playing',1,1)").run(roomId)
  await directory.db.prepare("INSERT INTO game_contexts(room_id,lifecycle,expires_at,created_at,updated_at) VALUES(?,'active',0,1,1)").run(roomId)
  await expect(discoverRoom(directory, 'alice', { roomId })).rejects.toMatchObject({ code: 'context_changed' })
  expect(await directory.db.prepare('SELECT lifecycle FROM game_contexts WHERE room_id=?').get(roomId)).toEqual({ lifecycle: 'expired' })
  expect(await directory.db.prepare('SELECT 1 FROM room_ownership WHERE room_id=?').get(roomId)).toBeUndefined()
})

it('protects a reservation acquired before expiry until its admission window ends', async () => {
  const roomId = randomUUID()
  await directory.db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES(?,'playing',1,1)").run(roomId)
  await directory.db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'active',1,1)").run(roomId)
  const userId = randomUUID()
  await directory.db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'hash',1)").run(userId, userId, 'Alice')
  await directory.db.prepare('INSERT INTO room_players(room_id,player_index,user_id,joined_at) VALUES(?,0,?,1)').run(roomId, userId)
  const admitted = await discoverRoom(directory, `user:${userId}`, { roomId }, userId)
  await directory.db.prepare('UPDATE game_contexts SET expires_at=0 WHERE room_id=?').run(roomId)
  expect(await discoverRoom(directory, `user:${userId}`, { roomId }, userId)).toEqual(admitted)
  await directory.db.prepare('UPDATE room_ownership SET admission_until=0 WHERE room_id=?').run(roomId)
  await expect(discoverRoom(directory, 'alice', { roomId })).rejects.toMatchObject({ code: 'context_changed' })
})

it('resolves explicit development slots after rematches without retargeting permanent links', async () => {
  const nextRoom = `dev2-${randomUUID()}`
  await directory.db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES ('dev2','expired',1,1), (?,'active',1,1)").run(nextRoom)
  await directory.db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES(?,'waiting',1,1)").run(nextRoom)
  await directory.db.prepare('INSERT INTO development_room_slots(root_id,room_id) VALUES (?,?)').run('dev2', nextRoom)
  await expect(discoverRoom(directory, 'alice', { roomId: 'dev2' })).rejects.toMatchObject({ code: 'context_changed' })
  vi.stubEnv('NODE_ENV', 'development')
  try {
    expect(await discoverRoom(directory, 'alice', { roomId: 'dev2', developmentSlot: true })).toEqual({ roomId: nextRoom, wsPath: '/nodes/a/ws' })
    const commands = new CommandStore(directory.db)
    const scope = await commands.issueScope('alice')
    const identity = { scopeId: scope.scopeId, commandId: randomUUID() }
    const pending = await commands.reserve('alice', identity, 'dev2', { type: 'newGame' })
    if (pending.kind !== 'pending') throw new Error('Expected pending command')
    await directory.db.transaction(() => commands.complete(pending.request, { ok: false, error: 'Rejected rematch' }))()
    expect(await discoverRoom(directory, 'alice', { roomId: 'dev2', developmentSlot: true, pendingIdentity: identity })).toEqual({ wsPath: '/nodes/a/ws' })
    vi.stubEnv('NODE_ENV', 'production')
    await expect(discoverRoom(directory, 'alice', { roomId: 'dev2', developmentSlot: true })).rejects.toMatchObject({ code: 'context_changed' })
  } finally { vi.unstubAllEnvs() }
})

it('discovers an idempotent creation allocation without creating a Room', async () => {
  const before = await directory.db.prepare('SELECT id FROM rooms ORDER BY id').all()
  const input = { allocationId: randomUUID() }
  expect(await discoverRoom(directory, 'alice', input)).toEqual(await discoverRoom(directory, 'alice', input))
  expect(await directory.db.prepare('SELECT id FROM rooms ORDER BY id').all()).toEqual(before)
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
    await directory.db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES(?,'waiting',1,1)").run(newRoom)
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
  const roomId = randomUUID()
  await directory.db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES(?,'playing',1,1)").run(roomId)
  await directory.db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'active',1,1)").run(roomId)
  const ownership = await directory.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').get(roomId)
  expect(await discoverRoom(directory, 'creator', { roomId, pendingIdentity: identity })).toEqual({ wsPath: '/nodes/a/ws' })
  expect(await directory.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').get(roomId)).toEqual(ownership)
})

it('lets an anonymous development actor rejoin a playing Room instead of routing it to spectating', async () => {
  const roomId = randomUUID()
  await directory.db.prepare("INSERT INTO rooms(id,status,hotseat,created_at,updated_at) VALUES(?,'playing',1,1,1)").run(roomId)
  await directory.db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'active',1,1)").run(roomId)
  const route = await discoverRoom(directory, 'development-anonymous', { roomId })
  expect(route).toMatchObject({ roomId, wsPath: expect.stringContaining('/nodes/a/') })
  expect(await directory.db.prepare('SELECT instance_id FROM room_ownership WHERE room_id=?').get(roomId)).toEqual({ instance_id: 'a' })
})

it('does not let a pending command reserve admission to an unowned offline game', async () => {
  const roomId = randomUUID()
  await directory.db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES(?,'playing',1,1)").run(roomId)
  await directory.db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'active',1,1)").run(roomId)
  const route = await directory.claim(roomId, 'a')
  await directory.db.transaction(() => directory.markActive(roomId, route.owner))()
  await directory.db.prepare('UPDATE room_ownership SET admission_until=0 WHERE room_id=?').run(roomId)
  const commands = new CommandStore(directory.db)
  const scope = await commands.issueScope('user:viewer')
  const identity = { scopeId: scope.scopeId, commandId: randomUUID() }
  const pending = await commands.reserve('user:viewer', identity, roomId, { type: 'newGame' })
  expect(pending.kind).toBe('pending')
  await expect(discoverRoom(directory, 'user:viewer', { roomId, pendingIdentity: identity }, 'viewer'))
    .rejects.toMatchObject({ code: 'not_participant' })
  expect(await directory.db.prepare('SELECT admission_until FROM room_ownership WHERE room_id=?').get(roomId))
    .toEqual({ admission_until: 0 })
})
