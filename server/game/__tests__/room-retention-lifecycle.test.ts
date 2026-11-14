import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import * as database from '../../db'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import { createWorkSession } from '../../__tests__/_helpers/session-fixtures'
import { serializeSessionSnapshot } from '../../../shared/session/serialization'
import { GameContextStore } from '../game-context-store'
import { RoomRetentionStore } from '../room-retention-store'
import { RoomDirectory } from '../room-directory'
import { RoomAuthority } from '../room-authority'
import { RoomRegistry } from '../room-registry'
import { RoomCommitter } from '../room-committer'
import { RoomPersistenceCheckpoint } from '../room-persistence-checkpoint'
import { PostgresRoomPersistence } from '../persistence/postgres-adapter'
import { type Room } from '../room'
import { createConnectionCtx } from '../../connection/connection-ctx'
import { dispatch, finishConnection } from '../../connection/room-router'
import { Broadcaster } from '../../connection/broadcaster'
import { createLobby } from '../lobby'
import { CommandStore } from '../command-store'
import { S3ObjectStore } from '../../storage/s3-store'
import { ResourceStore } from '../../storage/resource-store'
import { ReplayResources } from '../../storage/replay-resources'
import { testStorageEnvironment } from '../../__tests__/_helpers/objects'
import { enqueueRoomWork } from '../room-queue'

const DAY = 24 * 60 * 60 * 1000
const gate = () => {
  let release = () => {}
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

describe('room retention lifecycle', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>
  let directory: RoomDirectory
  let persistence: PostgresRoomPersistence
  let contexts: GameContextStore
  let registry: RoomRegistry
  let checkpoint: RoomPersistenceCheckpoint
  let committer: RoomCommitter
  let authority: RoomAuthority
  let objects: S3ObjectStore
  const sessions = new Set<ReturnType<typeof createWorkSession>>()

  beforeEach(async () => {
    db = await createTestDatabase()
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    for (const id of ['u1', 'u2']) await db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)').run(id, id, id, '', Date.now())
    directory = new RoomDirectory(db)
    await directory.register('retention-worker', 'http://127.0.0.1:5101', 'test-build')
    await directory.activate('retention-worker')
    persistence = new PostgresRoomPersistence(db, directory)
    contexts = new GameContextStore(db)
    registry = new RoomRegistry()
    checkpoint = new RoomPersistenceCheckpoint({ persistence })
    objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/retention-${randomUUID()}/`)
    const resources = new ReplayResources(new ResourceStore(db, objects))
    committer = new RoomCommitter({ persistence, resources, viewerBuildId: 'test-viewer', gameBuildId: 'test-build', viewerBuildExists: () => true })
    authority = new RoomAuthority(directory, 'retention-worker', registry, persistence, checkpoint, committer, contexts)
  })

  afterEach(async () => {
    committer.shutdown()
    for (const room of registry.iter()) room.customSessionExecutor?.dispose()
    for (const session of sessions) session.dispose()
    sessions.clear()
    objects.close()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await db.close()
  })

  const preparation = async (room: Room) => {
    await db.prepare("INSERT INTO stored_objects(object_key,content_hash,content_type,size_bytes,state,retain_until,updated_at) VALUES('replay-assets/fixture','fixture','image/png',1,'ready',0,0)").run()
    await db.prepare("INSERT INTO object_references(owner_kind,owner_id,object_key) VALUES('room-preparation',?,'replay-assets/fixture')").run(room.id)
  }

  const createRoom = async (id: string, status: 'waiting' | 'playing' = 'waiting'): Promise<Room> => {
    const session = createWorkSession({ seed: 321 })
    sessions.add(session)
    const assigned = await directory.claim(id, 'retention-worker')
    const room: Room = { id, session, status, maxPlayers: 2, version: 0, players: [],
      seatOwners: [{ userId: 'u1', playerIndex: 0 }, { userId: 'u2', playerIndex: 1 }],
      createdBy: 'u1', access: { kind: 'invited', invitedUserIds: ['u2'] }, owner: assigned.owner,
      ...(status === 'playing' ? { startedAt: Date.now() } : {}) }
    committer.lockNewRoom(room)
    await checkpoint.recordCreated(room)
    await committer.prepareRoom(room, { missingPrefix: false })
    await db.prepare('UPDATE room_ownership SET admission_until=0 WHERE room_id=?').run(id)
    registry.set(room)
    registry.touchActivity(id, Date.now() - 31 * 60 * 1000)
    await authority.retainOffline(room, Date.now())
    return room
  }

  it('freezes each offline deadline while applying the shared policy to the next cycle', async () => {
    const room = await createRoom('waiting-retention')
    const now = Date.now()
    const first = await contexts.readActiveRetention(room.id)
    expect(first).toEqual({ kind: 'active', expiresAt: expect.any(Number) })
    if (first.kind !== 'active' || first.expiresAt === null) throw new Error('Expected retained room')
    expect(first.expiresAt - now).toBeGreaterThan(3 * DAY - 1000)
    expect(first.expiresAt - now).toBeLessThanOrEqual(3 * DAY)
    const policies = new RoomRetentionStore(db)
    const policy = await policies.read()
    expect(await policies.update({ expectedRevision: policy.revision, waitingDays: 5, playingDays: 9 }, 'u1')).toMatchObject({ kind: 'updated' })
    expect(await new GameContextStore(db).ensureActiveExpiry(room.id, 'waiting', now + 1000)).toBe(first.expiresAt)
    await contexts.clearActiveExpiry(room.id)
    expect(await new GameContextStore(db).ensureActiveExpiry(room.id, 'waiting', now + 1000)).toBe(now + 1000 + 5 * DAY)
    await contexts.clearActiveExpiry(room.id)
    expect(await contexts.ensureActiveExpiry(room.id, 'playing', now)).toBe(now + 9 * DAY)
  })

  it.each([{ status: 'waiting', days: 3 }, { status: 'playing', days: 7 }] as const)(
    'preserves the pre $status deadline through cold loading and rejects at its exact $days-day boundary', async ({ status, days }) => {
      vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
      const room = await createRoom(`pre-${status}-deadline`, status)
      const retained = await contexts.readActiveRetention(room.id)
      if (retained.kind !== 'active' || retained.expiresAt === null) throw new Error('Missing fixed offline deadline')
      const deadline = retained.expiresAt
      expect(deadline - Date.now()).toBeGreaterThan(days * DAY - 1000)
      expect(deadline - Date.now()).toBeLessThanOrEqual(days * DAY)
      await authority.cleanupIdle(room, deadline - 1)
      expect(registry.get(room.id)).toBeUndefined()
      const restored = await authority.load(room.id)
      if (!restored) throw new Error('Missing retained pre room')
      sessions.add(restored.session)
      expect(await new GameContextStore(db).ensureActiveExpiry(room.id, status, deadline - 1)).toBe(deadline)
      await db.prepare('UPDATE room_ownership SET admission_until=0 WHERE room_id=?').run(room.id)
      await authority.cleanupIdle(restored, deadline)
      expect(await persistence.load(room.id)).toBeNull()
      expect(await contexts.lifecycle(room.id)).toBe('expired')
    },
  )

  it('preserves an existing deadline and expires a loaded room from that deadline', async () => {
    const room = await createRoom('old-retention')
    const oldDeadline = Date.now() + 1000
    await preparation(room)
    await contexts.setActiveExpiry(room.id, oldDeadline)
    const policies = new RoomRetentionStore(db), policy = await policies.read()
    await policies.update({ expectedRevision: policy.revision, waitingDays: 8, playingDays: 12 }, 'u1')
    expect(await contexts.ensureActiveExpiry(room.id, 'waiting', Date.now())).toBe(oldDeadline)
    await authority.cleanupIdle(room, oldDeadline - 1)
    expect(await persistence.load(room.id)).not.toBeNull()
    const reloaded = await authority.load(room.id)
    expect(reloaded).toBeDefined()
    if (!reloaded) throw new Error('Expected original room')
    sessions.add(reloaded.session)
    await db.prepare('UPDATE room_ownership SET admission_until=0 WHERE room_id=?').run(room.id)
    await authority.cleanupIdle(reloaded, oldDeadline)
    expect(await persistence.load(room.id)).toBeNull()
    expect(await contexts.lifecycle(room.id)).toBe('expired')
    expect(await db.prepare("SELECT 1 FROM object_references WHERE owner_kind='room-preparation' AND owner_id=?").get(room.id)).toBeUndefined()
  })

  it('unloads only memory and restores the exact pending interaction and undo history', async () => {
    const room = await createRoom('recoverable-retention', 'playing')
    const beforeWood = room.session.state.players[0]!.resources.wood
    const action = room.session.takeAction(0, 'forest')
    expect(action.ok).toBe(true)
    expect(action.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(await committer.commit(room, action, { commandType: 'action', intentJson: '{"spaceId":"forest"}' }, 0)).toMatchObject({ kind: 'committed' })
    const snapshot = await persistence.load(room.id)
    const deadline = await contexts.readActiveRetention(room.id)
    const owner = await db.prepare('SELECT * FROM room_ownership WHERE room_id=?').get(room.id)
    await preparation(room)
    expect(committer.isRecording(room.id)).toBe(true)
    await authority.cleanupIdle(room, Date.now())
    expect(registry.get(room.id)).toBeUndefined()
    expect(committer.isRecording(room.id)).toBe(false)
    expect(await persistence.load(room.id)).toEqual(snapshot)
    expect(await contexts.readActiveRetention(room.id)).toEqual(deadline)
    expect(await db.prepare('SELECT * FROM room_ownership WHERE room_id=?').get(room.id)).toEqual(owner)
    expect(await db.prepare("SELECT 1 FROM object_references WHERE owner_kind='room-preparation' AND owner_id=?").get(room.id)).toBeDefined()
    const restored = await authority.load(room.id)
    expect(restored).toBeDefined()
    if (!restored) throw new Error('Expected restored room')
    sessions.add(restored.session)
    expect(serializeSessionSnapshot(restored.session.state, restored.session)).toEqual(snapshot?.serialized)
    expect(restored.access).toEqual({ kind: 'invited', invitedUserIds: ['u2'] })
    expect(restored.seatOwners).toEqual(room.seatOwners)
    expect(restored.session.getState().interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const undo = restored.session.undoStep()
    expect(undo.ok).toBe(true)
    expect(undo.state.players[0]!.resources.wood).toBe(beforeWood)
    expect(await committer.commit(restored, undo, { commandType: 'undoStep', intentJson: '{}' }, 0)).toMatchObject({ kind: 'committed' })
    await checkpoint.recordMeta(restored)
    expect((await persistence.load(room.id))?.version).toBe(restored.version)
  })

  it('keeps a room reconnectable and writable when expiry fails at the outer commit', async () => {
    const room = await createRoom('expiry-commit-rollback')
    const deadline = Date.now() + 60_000
    await contexts.setActiveExpiry(room.id, deadline)
    const before = await persistence.load(room.id)
    await db.exec(`CREATE FUNCTION reject_expiry_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'expiry outer commit failed'; END;
      $$;
      CREATE CONSTRAINT TRIGGER reject_expiry_commit AFTER DELETE ON rooms
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_expiry_commit();`)
    await expect(authority.cleanupIdle(room, deadline)).rejects.toThrow('expiry outer commit failed')
    expect(await contexts.readActiveRetention(room.id)).toEqual({ kind: 'active', expiresAt: deadline })
    expect(await persistence.load(room.id)).toEqual(before)
    expect(registry.get(room.id)).toBe(room)
    const ws = new WebSocket(null, undefined, { autoPong: true })
    vi.spyOn(ws, 'readyState', 'get').mockReturnValue(WebSocket.OPEN)
    const send = vi.spyOn(ws, 'send').mockImplementation(() => {})
    const broadcaster = new Broadcaster(directory), lobby = createLobby({ registry, checkpoint, broadcaster })
    const ctx = createConnectionCtx(ws, { registry, checkpoint, committer, authority, broadcaster, lobby,
      gameContextStore: contexts, commands: new CommandStore(db) }, true, 'u1')
    await dispatch(ctx, { type: 'joinRoom', roomId: room.id, intent: 'resume' })
    expect(send.mock.calls.map(([raw]) => JSON.parse(String(raw)))).toContainEqual(expect.objectContaining({ type: 'roomJoined', roomId: room.id }))
    await checkpoint.recordMeta(room)
    expect(await contexts.readActiveRetention(room.id)).toEqual({ kind: 'active', expiresAt: null })
    expect((await persistence.load(room.id))?.version).toBe(room.version)
  })

  it('keeps the room pinned between join loading and queued execution', async () => {
    const room = await createRoom('join-race')
    const entered = gate(), release = gate(), load = authority.load.bind(authority)
    vi.spyOn(authority, 'load').mockImplementationOnce(async id => {
      const loaded = await load(id)
      entered.release()
      await release.promise
      return loaded
    })
    const ws = new WebSocket(null, undefined, { autoPong: true })
    vi.spyOn(ws, 'readyState', 'get').mockReturnValue(WebSocket.OPEN)
    const send = vi.spyOn(ws, 'send').mockImplementation(() => {})
    const broadcaster = new Broadcaster(directory)
    const lobby = createLobby({ registry, checkpoint, broadcaster })
    const ctx = createConnectionCtx(ws, { registry, checkpoint, committer, authority, broadcaster, lobby,
      gameContextStore: contexts, commands: new CommandStore(db) }, true, 'u1')
    const joining = dispatch(ctx, { type: 'joinRoom', roomId: room.id, intent: 'resume' })
    await entered.promise
    await authority.cleanupIdle(room, Date.now())
    expect(registry.get(room.id)).toBe(room)
    release.release()
    await joining
    expect(ctx.currentRoom).toBe(room)
    expect(send.mock.calls.map(([raw]) => JSON.parse(String(raw)))).toContainEqual(expect.objectContaining({ type: 'roomJoined', roomId: room.id }))
  })

  it('rechecks a pin acquired while an unload transaction is waiting', async () => {
    const room = await createRoom('late-pin')
    const entered = gate(), releaseRead = gate(), releasePin = gate()
    const read = contexts.readActiveRetention.bind(contexts)
    let reads = 0
    vi.spyOn(contexts, 'readActiveRetention').mockImplementation(async id => {
      const retention = await read(id)
      if (++reads === 2) { entered.release(); await releaseRead.promise }
      return retention
    })
    const cleanup = authority.cleanupIdle(room, Date.now())
    await entered.promise
    const pinned = authority.withRooms([room.id], () => releasePin.promise)
    releaseRead.release()
    await cleanup
    expect(registry.get(room.id)).toBe(room)
    releasePin.release()
    await pinned
    await authority.cleanupIdle(room, Date.now())
    expect(registry.get(room.id)).toBeUndefined()
    expect(await persistence.load(room.id)).not.toBeNull()
  })

  it('pins an existing room while its direct load checks ownership', async () => {
    const room = await createRoom('direct-load-pin'), entered = gate(), release = gate()
    const assertOwner = authority.assert.bind(authority)
    vi.spyOn(authority, 'assert').mockImplementationOnce(async loaded => {
      await assertOwner(loaded)
      entered.release()
      await release.promise
    })
    const loading = authority.load(room.id)
    await entered.promise
    await authority.cleanupIdle(room, Date.now())
    expect(registry.get(room.id)).toBe(room)
    release.release()
    expect(await loading).toBe(room)
  })

  it('pins both disconnect rooms when queued connection work changes the current room', async () => {
    const previous = await createRoom('disconnect-before'), next = await createRoom('disconnect-after')
    const ws = new WebSocket(null, undefined, { autoPong: true })
    const broadcaster = new Broadcaster(directory), lobby = createLobby({ registry, checkpoint, broadcaster })
    const ctx = createConnectionCtx(ws, { registry, checkpoint, committer, authority, broadcaster, lobby, gameContextStore: contexts }, true, 'u1')
    ctx.currentRoom = previous
    const moving = gate(), releaseMove = gate(), disconnected = gate(), releaseDisconnect = gate()
    const cleanupReading = gate(), releaseCleanup = gate(), read = contexts.readActiveRetention.bind(contexts)
    let heldRead = false
    vi.spyOn(contexts, 'readActiveRetention').mockImplementation(async id => {
      const retention = await read(id)
      if (id === next.id && !heldRead) {
        heldRead = true
        cleanupReading.release()
        await releaseCleanup.promise
      }
      return retention
    })
    const pin = vi.spyOn(authority, 'withRooms')
    const move = enqueueRoomWork([ctx], async () => {
      moving.release()
      await releaseMove.promise
      ctx.currentRoom = next
    })
    await moving.promise
    const disconnect = finishConnection(ctx, async () => {
      disconnected.release()
      await releaseDisconnect.promise
    })
    await authority.cleanupIdle(previous, Date.now())
    expect(registry.get(previous.id)).toBe(previous)
    const cleaningNext = authority.cleanupIdle(next, Date.now())
    await cleanupReading.promise
    releaseMove.release()
    await move
    await vi.waitFor(() => expect(pin).toHaveBeenCalledWith([next.id], expect.any(Function)))
    releaseCleanup.release()
    await cleaningNext
    await disconnected.promise
    expect(registry.get(next.id)).toBe(next)
    releaseDisconnect.release()
    await disconnect
    await authority.cleanupIdle(previous, Date.now())
    await authority.cleanupIdle(next, Date.now())
    expect(registry.has(previous.id)).toBe(false)
    expect(registry.has(next.id)).toBe(false)
  })

  it('keeps pending receipts and blocked recorder state loaded', async () => {
    const room = await createRoom('pending-retention', 'playing')
    const commands = new CommandStore(db), scope = await commands.issueScope('user:u1')
    const reserved = await commands.reserve('user:u1', { scopeId: scope.scopeId, commandId: randomUUID() }, room.id, { type: 'action', spaceId: 'forest' })
    expect(reserved.kind).toBe('pending')
    await authority.cleanupIdle(room, Date.now())
    expect(registry.get(room.id)).toBe(room)
    if (reserved.kind !== 'pending') throw new Error('Expected pending reservation')
    await db.transaction(() => commands.complete(reserved.request, { ok: false, roomId: room.id }))()
    vi.spyOn(persistence, 'loadReplayHead').mockRejectedValueOnce(new Error('temporary database failure'))
    expect(await committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({ kind: 'blocked' })
    await authority.cleanupIdle(room, Date.now())
    expect(registry.get(room.id)).toBe(room)
    expect(committer.forgetRoom(room.id)).toBe(false)
    expect(committer.isBlocked(room.id)).toBe(true)
  })

  it('keeps the default seven-day playing deadline and development exemption', async () => {
    const room = await createRoom('playing-retention', 'playing'), now = Date.now()
    const retention = await contexts.readActiveRetention(room.id)
    if (retention.kind !== 'active' || retention.expiresAt === null) throw new Error('Expected playing deadline')
    expect(retention.expiresAt - now).toBeGreaterThan(7 * DAY - 1000)
    expect(retention.expiresAt - now).toBeLessThanOrEqual(7 * DAY)
    const development = await createRoom('dev2')
    expect(await contexts.ensureActiveExpiry(development.id, 'waiting', now)).toBeNull()
    expect(await contexts.readActiveRetention(development.id)).toEqual({ kind: 'active', expiresAt: null })
    await authority.cleanupIdle(development, now + 8 * DAY)
    expect(registry.get(development.id)).toBe(development)
  })
})
