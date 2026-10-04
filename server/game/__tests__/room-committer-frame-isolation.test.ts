import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  serializeSessionSnapshot,
  type PersistedSessionSnapshot,
} from '../../../shared/session/serialization.ts'
import { stabilizeRandomHands } from '../../__tests__/_helpers/stabilize-random-hands.ts'
import { runMigrations } from '../../db.ts'
import { GameSession } from '../authoritative-session.ts'
import { SqliteRoomPersistence } from '../persistence/sqlite-adapter.ts'
import { decodeReplayFrame, type JsonValue } from '../replay-codec.ts'
import { RoomCommitter, replayIntentFromCommand } from '../room-committer.ts'
import type { Room } from '../room.ts'

const jsonValue = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue
const actionIntent = replayIntentFromCommand({ type: 'devSetResources', playerIndex: 0, resources: { food: 5 } })!

describe('RoomCommitter Frame isolation', () => {
  let db: Database.Database
  let persistence: SqliteRoomPersistence
  let room: Room
  let committer: RoomCommitter
  let retries: Array<() => void>

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, () => {})
    persistence = new SqliteRoomPersistence(db)
    const session = new GameSession(587, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    session.updatePlayerName(0, 'Before')
    session.state.log = [{
      key: 'log.placeFarmer',
      playerId: session.state.players[0]!.id,
      params: { player: 'Before', action: 'forest' },
    }]
    room = {
      id: 'frame-isolation', session, players: [], seatOwners: [],
      maxPlayers: 2, version: 0, status: 'playing', startedAt: 100,
    }
    retries = []
    committer = new RoomCommitter({
      persistence,
      enabled: true,
      viewerBuildId: 'viewer-1',
      gameBuildId: 'game-1',
      viewerBuildExists: () => true,
      scheduler: {
        setTimeout(callback) { retries.push(callback); return callback },
        clearTimeout(handle) { retries = retries.filter(callback => callback !== handle) },
      },
      now: () => 1_000,
    })
  })

  afterEach(() => {
    committer.shutdown()
    room.session.dispose()
    db.close()
  })

  const frameSource = (source: 'native' | 'worker') => {
    let snapshot: PersistedSessionSnapshot
    const capture = () => {
      snapshot = serializeSessionSnapshot(room.session.state, room.session)
      if (source === 'worker') {
        // IPC gives the main process a writable structured clone of the saved view.
        snapshot = structuredClone(snapshot)
        snapshot.frame.players[0]!.pastureCapacities = { worker: 7 }
      }
      return snapshot
    }
    capture()
    if (source === 'worker') {
      room.customSessionExecutor = {
        serializedStateForPersistence: () => snapshot,
        scoresForPersistence: () => room.session.getState().scores,
      } as NonNullable<Room['customSessionExecutor']>
    }
    return capture
  }

  const rejectStepOne = () => db.exec(`
    CREATE TRIGGER reject_step BEFORE INSERT ON game_replay_steps
    WHEN NEW.step_no = 1 BEGIN SELECT RAISE(ABORT, 'disk unavailable'); END;
  `)

  const rawFrames = (): JsonValue[] => {
    const rows = db.prepare(`
      SELECT payload_kind, payload_gzip, checkpoint_step_no, frame_hash
      FROM game_replay_steps WHERE room_id = ? ORDER BY step_no
    `).all(room.id) as Array<{
      payload_kind: 'checkpoint' | 'delta'
      payload_gzip: Buffer
      checkpoint_step_no: number
      frame_hash: string
    }>
    let previous: JsonValue | null = null
    return rows.map(row => {
      previous = decodeReplayFrame(previous, {
        payloadKind: row.payload_kind,
        payloadGzip: row.payload_gzip,
        checkpointStepNo: row.checkpoint_step_no,
        frameHash: row.frame_hash,
      })
      return previous
    })
  }

  it.each(['native', 'worker'] as const)(
    'preserves the frozen %s Frame and the next delta across live changes and retry',
    source => {
      const capture = frameSource(source)
      const initial = jsonValue(capture().frame)
      expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({ kind: 'committed', stepNo: 0 })

      const response = room.session.devSetResources(0, { food: 5 })
      const firstSnapshot = capture()
      const firstFrame = jsonValue(firstSnapshot.frame)
      rejectStepOne()
      expect(committer.commit(room, response, actionIntent, 0))
        .toEqual({ kind: 'blocked', error: 'disk unavailable' })

      // The live state can change independently; captured histories are never mutated.
      room.session.updatePlayerName(0, 'After')
      room.session.state.players[0]!.resources.food = 9
      room.session.state.log = [{
        key: 'log.placeFarmer',
        playerId: room.session.state.players[0]!.id,
        params: { player: 'After', action: 'reed-bank' },
      }, ...room.session.state.log]
      db.exec('DROP TRIGGER reject_step')
      retries.shift()!()
      expect(committer.isBlocked(room.id)).toBe(false)
      expect(persistence.loadReplayFrame(room.id)).toEqual(firstFrame)
      expect(rawFrames()).toEqual([initial, firstFrame])

      // Worker snapshots are cached externally; their mutable bodies must not own the head.
      if (source === 'worker') {
        firstSnapshot.frame.players[0]!.name = 'Changed cached snapshot'
        firstSnapshot.frame.players[0]!.resources.food = 999
      }
      const nextResponse = room.session.getState()
      const nextFrame = jsonValue(capture().frame)
      expect(committer.commit(room, nextResponse, actionIntent, 0))
        .toMatchObject({ kind: 'committed', stepNo: 2 })
      expect(persistence.loadReplayFrame(room.id)).toEqual(nextFrame)
      expect(rawFrames()).toEqual([initial, firstFrame, nextFrame])
    },
  )

  it.each(['native', 'worker'] as const)(
    'freezes %s final scores before a failed commit is retried',
    source => {
      const capture = frameSource(source)
      const initial = jsonValue(capture().frame)
      expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({ kind: 'committed', stepNo: 0 })
      room.session.state.gameOver = true
      const response = room.session.getState()
      expect(response.scores).toBeDefined()
      const finalFrame = jsonValue({ ...capture().frame, scores: response.scores })
      rejectStepOne()
      expect(committer.commit(room, response, actionIntent, 0))
        .toEqual({ kind: 'blocked', error: 'disk unavailable' })

      response.scores![0]!.total = 999
      response.scores![0]!.playerName = 'Changed score'
      room.session.updatePlayerName(0, 'After')
      db.exec('DROP TRIGGER reject_step')
      retries.shift()!()

      expect(committer.isBlocked(room.id)).toBe(false)
      expect(persistence.loadReplayHead(room.id)).toMatchObject({ status: 'completed', latestStepNo: 1 })
      expect(rawFrames()).toEqual([initial, finalFrame])
    },
  )
})
