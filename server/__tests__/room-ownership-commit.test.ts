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
