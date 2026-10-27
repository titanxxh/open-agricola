import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { QueryResultRow } from 'pg'
import { createTestDatabase } from './_helpers/postgres'
import { RoomDirectory, type OwnerToken } from '../game/room-directory'
let directory: RoomDirectory
beforeEach(async () => { directory = new RoomDirectory(await createTestDatabase()) })
afterEach(async () => { await directory.db.close() })
const start = async (id: string, port: number, capacity = 30, generation = 'build-one') => {
  await directory.register(id, `http://127.0.0.1:${port}`, generation, capacity)
  await directory.activate(id)
}

const recordConnected = async (roomId: string, owner: OwnerToken) => {
  await directory.db.transaction(async () => {
    await directory.db.prepare('INSERT INTO rooms(id, status, created_at, updated_at) VALUES (?, ?, 1, 1)').run(roomId, 'playing')
    await directory.markActive(roomId, owner)
    await directory.presence(roomId, owner, 1, 2)
  })()
}

it('releases offline retained rooms and checks their first resume against online capacity', async () => {
  await start('only', 9001, 1)
  const retained = await directory.claim('retained', 'only')
  await recordConnected(retained.roomId, retained.owner)
  await expect(directory.allocate('another', randomUUID())).rejects.toThrow('capacity')
  await directory.db.transaction(() => directory.presence(retained.roomId, retained.owner, 0, 2))()
  const next = await directory.allocate('another', randomUUID())
  expect(next.owner.instanceId).toBe('only')
  await expect(directory.claim(retained.roomId)).rejects.toThrow('capacity')
  expect(await directory.db.prepare('SELECT id FROM rooms WHERE id=?').get(retained.roomId)).toEqual({ id: 'retained' })
})

it('atomically admits only one of two independent first resumes while reusing duplicate room claims', async () => {
  await start('only', 9001, 1)
  const retained = []
  for (const id of ['first', 'second']) {
    const assigned = await directory.claim(id, 'only')
    await recordConnected(id, assigned.owner)
    await directory.db.transaction(() => directory.presence(id, assigned.owner, 0, 2))()
    retained.push(assigned)
  }
  const attempts = await Promise.allSettled(retained.map(room => directory.claim(room.roomId)))
  expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1)
  expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1)
  const admitted = attempts.find(attempt => attempt.status === 'fulfilled')
  if (!admitted || admitted.status !== 'fulfilled') throw new Error('One resume must be admitted')
  const repeated = await Promise.all([directory.claim(admitted.value.roomId), directory.claim(admitted.value.roomId)])
  expect(repeated).toEqual([admitted.value, admitted.value])
})

it('keeps an incoming resume reservation when an older zero-presence observation arrives', async () => {
  await start('only', 9001, 1)
  const retained = await directory.claim('retained', 'only')
  await recordConnected(retained.roomId, retained.owner)
  await directory.db.transaction(() => directory.presence(retained.roomId, retained.owner, 0, 2))()
  await directory.claim(retained.roomId)
  await directory.db.transaction(() => directory.presence(retained.roomId, retained.owner, 0, 2))()
  await expect(directory.allocate('another', randomUUID())).rejects.toThrow('capacity')
})

it('expires admission independently of the five-minute creation identity and rechecks delayed creation', async () => {
  await start('only', 9001, 1)
  const allocated = await directory.allocate('alice', randomUUID())
  await directory.db.prepare('UPDATE room_ownership SET admission_until=0 WHERE room_id=?').run(allocated.roomId)
  const next = await directory.allocate('bob', randomUUID())
  expect(next.roomId).not.toBe(allocated.roomId)
  const identity = { scopeId: randomUUID(), commandId: randomUUID() }
  await expect(directory.db.transaction(() => directory.consumeAllocation('alice', allocated.allocationId, identity, 'only'))())
    .rejects.toThrow('capacity')
  expect(await directory.db.prepare('SELECT allocation_id FROM room_allocations WHERE room_id=?').get(allocated.roomId))
    .toEqual({ allocation_id: allocated.allocationId })
})

it('keeps admission through activation and requires a live reservation before the first positive presence', async () => {
  await start('only', 9001, 1)
  const assigned = await directory.claim('loading', 'only')
  await directory.db.transaction(async () => {
    await directory.db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES('loading','playing',1,1)").run()
    await directory.markActive('loading', assigned.owner)
  })()
  await expect(directory.allocate('another', randomUUID())).rejects.toThrow('capacity')
  await directory.db.prepare("UPDATE room_ownership SET admission_until=0 WHERE room_id='loading'").run()
  await expect(directory.db.transaction(() => directory.presence('loading', assigned.owner, 1, 2))())
    .rejects.toThrow('admission expired')
  await directory.claim('loading')
  await directory.db.transaction(() => directory.presence('loading', assigned.owner, 1, 2))()
  expect(await directory.db.prepare("SELECT connected_count FROM room_presence WHERE room_id='loading'").get())
    .toEqual({ connected_count: 1 })
})

it('publishes presence while a simultaneous resume holds the admission lock and waits for the owner row', async () => {
  await start('only', 9001, 1)
  const room = await directory.claim('retained', 'only')
  await recordConnected(room.roomId, room.owner)
  let ownerLocked!: () => void
  let publishPresence!: () => void
  let admissionLocked!: () => void
  const ownerReady = new Promise<void>(done => { ownerLocked = done })
  const publish = new Promise<void>(done => { publishPresence = done })
  const admissionReady = new Promise<void>(done => { admissionLocked = done })
  const exec = directory.db.exec.bind(directory.db)
  const observeLock = vi.spyOn(directory.db, 'exec').mockImplementation(async sql => {
    await exec(sql)
    if (sql === 'SELECT pg_advisory_xact_lock(973)') admissionLocked()
  })
  const publication = directory.db.transaction(async () => {
    await directory.assertOwner(room.roomId, room.owner)
    ownerLocked()
    await publish
    await directory.presence(room.roomId, room.owner, 0, 2)
  })()
  let resumed: Promise<unknown> | undefined
  try {
    await ownerReady
    resumed = directory.claim(room.roomId)
    await admissionReady
    publishPresence()
    await Promise.all([publication, resumed])
    await expect(directory.allocate('another', randomUUID())).rejects.toThrow('capacity')
  } finally {
    publishPresence()
    await Promise.allSettled([publication, resumed])
    observeLock.mockRestore()
  }
})

it('consumes an allocation while a heartbeat holds the instance lock without reversing the owner lock order', async () => {
  await start('only', 9001, 1)
  const allocation = await directory.allocate('alice', randomUUID())
  const identity = { scopeId: randomUUID(), commandId: randomUUID() }
  let instanceLocked!: () => void
  let releaseHeartbeat!: () => void
  const instanceReady = new Promise<void>(done => { instanceLocked = done })
  const continueHeartbeat = new Promise<void>(done => { releaseHeartbeat = done })
  const prepare = directory.db.prepare.bind(directory.db)
  const observeLock = vi.spyOn(directory.db, 'prepare').mockImplementation(sql => {
    const statement = prepare(sql)
    return { ...statement, get: async <Row extends QueryResultRow = QueryResultRow>(...args: unknown[]) => {
      if (sql.includes('FROM app_instances') && sql.endsWith('FOR SHARE')) releaseHeartbeat()
      const result = await statement.get<Row>(...args)
      if (sql === 'SELECT * FROM app_instances WHERE instance_id=? FOR UPDATE') {
        instanceLocked()
        await continueHeartbeat
      }
      return result
    } }
  })
  const heartbeat = directory.heartbeat('only')
  let creating: Promise<unknown> | undefined
  try {
    await instanceReady
    creating = directory.db.transaction(() => directory.consumeAllocation('alice', allocation.allocationId, identity, 'only'))()
    const attempts = await Promise.allSettled([creating, heartbeat])
    expect(attempts).toEqual([
      { status: 'fulfilled', value: { roomId: allocation.roomId, owner: allocation.owner, wsPath: '/nodes/only/ws' } },
      { status: 'fulfilled', value: [] },
    ])
    expect(await directory.db.prepare('SELECT scope_id,command_id FROM room_allocations WHERE room_id=?').get(allocation.roomId))
      .toEqual({ scope_id: identity.scopeId, command_id: identity.commandId })
  } finally {
    releaseHeartbeat()
    await Promise.allSettled([creating, heartbeat])
    observeLock.mockRestore()
  }
})

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
  expect(await directory.lobby()).toContainEqual({ id: 'one', playerCount: 2, maxPlayers: 2, status: 'waiting' })
  await directory.db.prepare("UPDATE rooms SET status='playing' WHERE id='one'").run()
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
