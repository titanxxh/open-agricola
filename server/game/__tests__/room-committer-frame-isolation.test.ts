import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../database/postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prependDerivedLogEntries } from '../../../shared/events/log-cache.ts'
import {
  serializeSessionSnapshot,
  type PersistedSessionSnapshot,
} from '../../../shared/session/serialization.ts'
import { stabilizeRandomHands } from '../../__tests__/_helpers/stabilize-random-hands.ts'
import { GameSession } from '../authoritative-session.ts'
import { PostgresRoomPersistence } from '../persistence/postgres-adapter.ts'
import { decodeReplayFrame, type JsonValue } from '../replay-codec.ts'
import { RoomCommitter, replayIntentFromCommand } from '../room-committer.ts'
import type { Room } from '../room.ts'

const jsonValue = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue
const actionIntent = replayIntentFromCommand({ type: 'devSetResources', playerIndex: 0, resources: { food: 5 } })!

describe('RoomCommitter Frame isolation', () => {
  let db: PostgresDatabase
  let persistence: PostgresRoomPersistence
  let room: Room
  let committer: RoomCommitter
  let retries: Array<() => void>

  beforeEach(async () => {
    db = await createTestDatabase()


    persistence = new PostgresRoomPersistence(db)
    const session = new GameSession(587, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    session.updatePlayerName(0, 'Before')
    prependDerivedLogEntries(session.state, [{
      key: 'log.placeFarmer',
      playerId: session.state.players[0]!.id,
      params: { player: 'Before', action: 'forest' },
    }])
    room = {
      id: 'frame-isolation', session, players: [], seatOwners: [],
      maxPlayers: 2, version: 0, status: 'playing', replayRecording: true, replayViewerBuildId: 'viewer-1', replayGameBuildId: 'game-1', startedAt: 100,
    }
    retries = []
    committer = new RoomCommitter({
      persistence,
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

  afterEach(async () => {
    committer.shutdown()
    room.session.dispose()
    ;(await db.close())
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

  const rejectStepOne = async () => (await db.exec(`
    CREATE FUNCTION reject_step_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step_no = 1 THEN RAISE EXCEPTION 'disk unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_step BEFORE INSERT ON game_replay_steps FOR EACH ROW EXECUTE FUNCTION reject_step_fn();
  `))

  const rawFrames = async (): Promise<Awaited<JsonValue[]>> => {
    const rows = (await db.prepare(`
      SELECT payload_kind, payload_gzip, checkpoint_step_no, frame_hash
      FROM game_replay_steps WHERE room_id = ? ORDER BY step_no
    `).all(room.id)) as Array<{
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
    async source => {
      const capture = frameSource(source)
      const initial = jsonValue(capture().frame)
      expect((await committer.prepareRoom(room, { missingPrefix: false }))).toMatchObject({ kind: 'committed', stepNo: 0 })

      const response = room.session.devSetResources(0, { food: 5 })
      const firstSnapshot = capture()
      const firstFrame = jsonValue(firstSnapshot.frame)
      ;(await rejectStepOne())
      expect((await committer.commit(room, response, actionIntent, 0)))
        .toEqual({ kind: 'blocked', error: 'disk unavailable' })

      // The live state can change independently; captured histories are never mutated.
      room.session.updatePlayerName(0, 'After')
      room.session.state.players[0]!.resources.food = 9
      prependDerivedLogEntries(room.session.state, [{
        key: 'log.placeFarmer',
        playerId: room.session.state.players[0]!.id,
        params: { player: 'After', action: 'reed-bank' },
      }])
      ;(await db.exec('DROP TRIGGER reject_step ON game_replay_steps'))
      await retries.shift()!()
      expect(committer.isBlocked(room.id)).toBe(false)
      expect((await persistence.loadReplayFrame(room.id))).toEqual(firstFrame)
      expect((await rawFrames())).toEqual([initial, firstFrame])

      // Worker snapshots are cached externally; their mutable bodies must not own the head.
      if (source === 'worker') {
        firstSnapshot.frame.players[0]!.name = 'Changed cached snapshot'
        firstSnapshot.frame.players[0]!.resources.food = 999
      }
      const nextResponse = room.session.getState()
      const nextFrame = jsonValue(capture().frame)
      expect((await committer.commit(room, nextResponse, actionIntent, 0)))
        .toMatchObject({ kind: 'committed', stepNo: 2 })
      expect((await persistence.loadReplayFrame(room.id))).toEqual(nextFrame)
      expect((await rawFrames())).toEqual([initial, firstFrame, nextFrame])
    },
  )

  it.each(['native', 'worker'] as const)(
    'freezes %s final scores before a failed commit is retried',
    async source => {
      const capture = frameSource(source)
      const initial = jsonValue(capture().frame)
      expect((await committer.prepareRoom(room, { missingPrefix: false }))).toMatchObject({ kind: 'committed', stepNo: 0 })
      room.session.state.gameOver = true
      const response = room.session.getState()
      expect(response.scores).toBeDefined()
      const finalFrame = jsonValue({ ...capture().frame, scores: response.scores })
      ;(await rejectStepOne())
      expect((await committer.commit(room, response, actionIntent, 0)))
        .toEqual({ kind: 'blocked', error: 'disk unavailable' })

      response.scores![0]!.total = 999
      response.scores![0]!.playerName = 'Changed score'
      room.session.updatePlayerName(0, 'After')
      ;(await db.exec('DROP TRIGGER reject_step ON game_replay_steps'))
      await retries.shift()!()

      expect(committer.isBlocked(room.id)).toBe(false)
      expect((await persistence.loadReplayHead(room.id))).toMatchObject({ status: 'completed', latestStepNo: 1 })
      expect((await rawFrames())).toEqual([initial, finalFrame])
    },
  )
})
