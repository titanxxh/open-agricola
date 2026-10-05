import { afterEach, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { RoomDirectory } from '../game/room-directory'
import { PostgresRoomPersistence } from '../game/persistence/postgres-adapter'
import { RoomCommitter, replayIntentFromCommand } from '../game/room-committer'
import { RoomPersistenceCheckpoint } from '../game/room-persistence-checkpoint'
import { GameSession } from '../game/authoritative-session'
import { snapshotToRoom, type Room } from '../game/room'
let cleanup: (() => Promise<void>) | undefined
afterEach(async () => { await cleanup?.() })

it.each(['playing', 'waiting', 'discard'] as const)('retires a completed owned Room into %s without losing its final Replay or accepting a stale version', async (next) => {
  const db = await createTestDatabase()
  const directory = new RoomDirectory(db)
  const persistence = new PostgresRoomPersistence(db, directory)
  const checkpoint = new RoomPersistenceCheckpoint({ persistence })
  const committer = new RoomCommitter({ persistence, viewerBuildId: 'test-viewer', gameBuildId: 'test', viewerBuildExists: () => true })
  const session = new GameSession(42, undefined, { playerCount: 2, enableParentCards: false })
  for (const player of session.state.players) { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] }
  cleanup = async () => { committer.shutdown(); session.dispose(); await db.close() }
  await directory.register('a', 'http://127.0.0.1:9001', 'test'); await directory.activate('a')
  const room: Room = { id: 'finished', owner: (await directory.claim('finished', 'a')).owner, session,
    players: [], seatOwners: [], status: 'playing', startedAt: 1, version: 0, maxPlayers: 2 }
  committer.lockNewRoom(room)
  await checkpoint.recordCreated(room)
  await committer.prepareRoom(room, { missingPrefix: false })
  const finished = session.loadState({ ...session.state, gameOver: true })
  expect(await committer.commit(room, finished, replayIntentFromCommand({ type: 'roundEnd' })!, 0)).toMatchObject({ kind: 'committed', roomVersion: 1 })
  expect(await persistence.load(room.id)).toBeNull()
  const finalStep = await db.prepare('SELECT * FROM game_replay_steps WHERE room_id=? AND step_no=1').get(room.id)
  // Completion does not authorize ordinary writes or stale lifecycle changes.
  await expect(checkpoint.recordMeta(room)).rejects.toThrow('version changed')
  await expect(persistence.discard(room.id, { owner: room.owner, expectedVersion: 0 })).rejects.toThrow('version changed')
  if (next === 'discard') {
    await persistence.discard(room.id, { owner: room.owner, expectedVersion: room.version })
  } else {
    const successor: Room = { ...room, id: 'successor', status: next, version: 0,
      owner: (await directory.replacement('successor', room.id, room.owner!, false)).owner }
    const options = { retireRoomId: room.id, retiredOwner: room.owner, retiredVersion: room.version }
    // A rematch's new session starts from a fresh, deterministic two-seat state.
    successor.session = new GameSession(43, undefined, { playerCount: 2, enableParentCards: false })
    for (const player of successor.session.state.players) { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] }
    try {
      committer.lockNewRoom(successor)
      if (next === 'waiting') await checkpoint.recordCreated(successor, options)
      else expect(await committer.prepareRoom(successor, { ...options, missingPrefix: false })).toMatchObject({ kind: 'committed', stepNo: 0 })
      expect((await persistence.load(successor.id))?.meta.status).toBe(next)
    } finally { successor.session.dispose() }
  }
  expect(await db.prepare('SELECT status FROM room_ownership WHERE room_id=?').get(room.id)).toEqual({ status: 'retired' })
  expect(await db.prepare('SELECT lifecycle FROM game_contexts WHERE room_id=?').get(room.id)).toEqual({ lifecycle: 'completed' })
  expect(await db.prepare('SELECT room_id FROM game_results WHERE room_id=?').get(room.id)).toEqual({ room_id: room.id })
  expect(await db.prepare('SELECT * FROM game_replay_steps WHERE room_id=? AND step_no=1').get(room.id)).toEqual(finalStep)
})

it('checks owner/version with metadata and Replay writes, preserving retry identity after a successful commit', async () => {
  const db = await createTestDatabase()
  const directory = new RoomDirectory(db)
  const persistence = new PostgresRoomPersistence(db, directory)
  const checkpoint = new RoomPersistenceCheckpoint({ persistence })
  const committer = new RoomCommitter({ persistence, viewerBuildId: 'test-viewer', gameBuildId: 'test', viewerBuildExists: () => true })
  const session = new GameSession(42, undefined, { playerCount: 2, enableParentCards: false })
  for (const player of session.state.players) { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] }
  cleanup = async () => { committer.shutdown(); session.dispose(); await db.close() }
  await directory.register('a', 'http://127.0.0.1:9001', 'test'); await directory.activate('a')
  const allocated = await directory.claim('owned', 'a')
  const room: Room = { id: 'owned', owner: allocated.owner, session, players: [], seatOwners: [], status: 'playing', version: 0, maxPlayers: 2 }
  committer.lockNewRoom(room)
  await checkpoint.recordCreated(room)
  expect(await committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({ kind: 'committed', roomVersion: 0 })
  const spy = vi.spyOn(persistence, 'commitReplay')
  const player = session.state.currentPlayerIndex
  const response = session.takeAction(player, 'forest')
  expect(response.ok).toBe(true)
  expect(await committer.commit(room, response, replayIntentFromCommand({ type: 'action', spaceId: 'forest' })!, player)).toMatchObject({ kind: 'committed', roomVersion: 1 })
  const frozen = spy.mock.calls[0]![0]
  expect(await persistence.commitReplay(frozen)).toEqual({ kind: 'idempotent' })
  const restored = snapshotToRoom((await persistence.load(room.id))!)
  expect(restored.version).toBe(1); restored.session.dispose()
  await expect(checkpoint.recordMeta({ ...room, version: 0 })).rejects.toThrow('version changed')
  await directory.stop('a')
  await directory.register('b', 'http://127.0.0.1:9002', 'test'); await directory.activate('b')
  await directory.claim(room.id, 'b')
  await expect(persistence.commitReplay(frozen)).rejects.toThrow('ownership changed')
  await expect(checkpoint.recordMeta(room)).rejects.toThrow('ownership changed')
  const undo = session.undoStep()
  expect(await committer.commit(room, undo, replayIntentFromCommand({ type: 'undoStep' })!, player)).toMatchObject({ kind: 'blocked' })
  expect(committer.isRetrying(room.id)).toBe(false)
  expect((await persistence.loadReplayHead(room.id))!.latestStepNo).toBe(1)
})
