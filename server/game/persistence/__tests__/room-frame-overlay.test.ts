import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../../db'
import { GameSession } from '../../authoritative-session'
import { frameHash, type JsonValue, type ReplayDeltaOperation } from '../../replay-codec'
import { stabilizeRandomHands } from '../../../__tests__/_helpers/stabilize-random-hands'
import { rehydrateState, serializeSessionSnapshot } from '../../../../shared/session/serialization'
import { SqliteRoomPersistence } from '../sqlite-adapter'
import { RoomHistoryCorruptionError } from '../room-history-store'
import { parseRoomBody } from '../room-body-codec'
import type { RoomMeta } from '../room-persistence'

const meta: RoomMeta = { createdBy: null, maxPlayers: 2, customCardDbIds: [], status: 'playing', players: [] }
type StoredOverlay = {
  roomHistoryVersion: 2
  state: Record<string, JsonValue>
  frameDelta: ReplayDeltaOperation[]
  rawFrameHash: string
  sessionCursor: JsonValue
}
const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup()))

const setup = () => {
  const db = new Database(':memory:')
  cleanups.push(() => db.close())
  db.pragma('foreign_keys = ON')
  runMigrations(db, () => {})
  const game = new GameSession(563, undefined, { playerCount: 2 })
  cleanups.push(() => game.dispose())
  stabilizeRandomHands(game.state.players)
  const persistence = new SqliteRoomPersistence(db)
  const readStored = (): StoredOverlay => parseRoomBody(
    (db.prepare('SELECT state_json FROM rooms WHERE id = ?').get('r') as { state_json: string }).state_json,
  ) as StoredOverlay
  return { db, game, persistence, readStored }
}

describe('Room Frame overlay storage', () => {
  it('round-trips the exact raw Frame, including derived values, constants, scores and future differences', () => {
    const { game, persistence, readStored } = setup()
    const captured = serializeSessionSnapshot(game.state, game)
    const snapshot = {
      ...captured,
      state: Object.assign({ ...captured.state }, {
        futureProjection: {
          items: [{ value: 'state' }, 'removed'],
          shortened: [1, 2, 3],
          stateOnly: { preserved: true },
        },
        futureStateOnly: true,
      }),
      frame: Object.assign({ ...captured.frame }, {
        futureProjection: {
          items: [{ value: 'frame' }, 'changed', { appended: true }],
          shortened: [1],
          'path/with~escaping': { archived: true },
        },
        futureFrameOnly: ['exact', 1234],
        scores: [{ playerId: 'p1', total: -7 }],
      }),
    }
    snapshot.frame.players[0]!.pastureCapacities = { archived: 27 }
    const expected = JSON.parse(JSON.stringify(snapshot))
    const expectedHash = frameHash(snapshot.frame)

    persistence.save('r', snapshot, meta)
    const stored = readStored()
    expect(stored.roomHistoryVersion).toBe(2)
    expect(stored).not.toHaveProperty('frameWithoutStreams')
    expect(stored.rawFrameHash).toBe(expectedHash)
    expect(stored.frameDelta).toContainEqual({ op: 'remove', path: '/futureStateOnly' })
    expect(stored.frameDelta.some(operation => operation.path.endsWith('/flow') && operation.op === 'remove')).toBe(true)

    const restored = persistence.load('r')!.serialized!
    expect(restored).toEqual(expected)
    expect(frameHash(restored.frame)).toBe(expectedHash)
    expect(persistence.loadReplayFrame('r')).toEqual(expected.frame)
    expect(restored.state.actionSpaces.some(space => Object.hasOwn(space, 'flow'))).toBe(true)
    expect(restored.frame.actionSpaces.every(space => !Object.hasOwn(space, 'flow'))).toBe(true)
    expect(restored.frame.roundStartSnapshot).toBeNull()
    expect(restored.frame.engineStack).toEqual({ frames: [] })
  })

  it('preserves own prototype-named future fields when the Frame adds, removes or replaces them', () => {
    const { game, persistence } = setup()
    const captured = serializeSessionSnapshot(game.state, game)
    const snapshot = {
      ...captured,
      state: Object.assign({ ...captured.state }, {
        futureProjection: JSON.parse('{"removed":{"constructor":{"old":true}},"added":{},"replaced":{"__proto__":{"value":"state"}}}') as JsonValue,
      }),
      frame: Object.assign({ ...captured.frame }, {
        futureProjection: JSON.parse('{"removed":{},"added":{"__proto__":{"value":"frame"},"toString":"saved"},"replaced":{"__proto__":{"value":"frame"}}}') as JsonValue,
      }),
    }
    persistence.save('r', snapshot, meta)
    const restored = persistence.load('r')!.serialized!
    expect(restored).toEqual(JSON.parse(JSON.stringify(snapshot)))
    expect(frameHash(restored.frame)).toBe(frameHash(snapshot.frame))
    expect(Object.getPrototypeOf(restored.frame)).toBe(Object.prototype)
  })

  it('keeps different state and Frame history versions instead of deriving Frame histories from state', () => {
    const { game, persistence, readStored } = setup()
    expect(game.takeAction(0, 'forest').ok).toBe(true)
    const snapshot = serializeSessionSnapshot(game.state, game)
    expect(snapshot.state.events.length).toBeGreaterThan(0)
    expect(snapshot.state.publicEventArchive.length).toBeGreaterThan(0)
    snapshot.frame.log = [{ key: 'frameOnlyCapture', playerId: 'p1', params: { player: 'Archived name' } }]
    snapshot.frame.events = snapshot.state.events.map(event => ({ ...event, seq: event.seq + 100 }))
    snapshot.frame.publicEventArchive = snapshot.state.publicEventArchive.map(packet => ({ ...packet, packetSeq: packet.packetSeq + 100 }))
    const expected = JSON.parse(JSON.stringify(snapshot))

    persistence.save('r', snapshot, meta)
    const stored = readStored()
    expect(stored.frameDelta.filter(operation => operation.path.startsWith('/historyStreams/'))).not.toHaveLength(0)
    const restored = persistence.load('r')!.serialized!
    expect(restored.state).toEqual(expected.state)
    expect(restored.frame).toEqual(expected.frame)
    expect(frameHash(restored.frame)).toBe(stored.rawFrameHash)
    expect(persistence.loadReplayFrame('r')).toEqual(expected.frame)
  })

  it('restores independent writable core bodies and continues rules without changing the saved Frame', () => {
    const { game, persistence } = setup()
    const snapshot = serializeSessionSnapshot(game.state, game)
    persistence.save('r', snapshot, meta)
    const restored = persistence.load('r')!.serialized!
    const originalFrame = JSON.stringify(restored.frame)
    restored.state.players[0]!.resources.wood = 777
    restored.state.players[0]!.minorHand.push('__restored_state_only__')
    expect(JSON.stringify(restored.frame)).toBe(originalFrame)
    restored.frame.players[0]!.resources.food = 999
    expect(restored.state.players[0]!.resources.food).not.toBe(999)

    const saved = persistence.load('r')!.serialized!
    const savedJson = JSON.stringify(saved)
    const resumed = new GameSession(rehydrateState(saved))
    cleanups.push(() => resumed.dispose())
    expect(resumed.takeAction(0, 'forest').ok).toBe(true)
    expect(JSON.stringify(saved)).toBe(savedJson)
    expect(persistence.loadReplayFrame('r')).toEqual(snapshot.frame)
  })

  it('still reads version 1 raw Frame bodies without querying Replay payloads', () => {
    const { db, game, persistence, readStored } = setup()
    const snapshot = serializeSessionSnapshot(game.state, game)
    persistence.save('r', snapshot, meta)
    const { frameDelta: _delta, ...stored } = readStored()
    const { log: _log, events: _events, publicEventArchive: _archive, ...body } = snapshot.frame
    const legacy = {
      ...stored,
      roomHistoryVersion: 1,
      frameWithoutStreams: { ...body, historyStreams: stored.state.historyStreams },
    }
    db.prepare('UPDATE rooms SET state_json = ? WHERE id = ?').run(JSON.stringify(legacy), 'r')
    db.exec('DROP TABLE game_replay_steps')
    const restored = persistence.load('r')!.serialized!
    expect(restored).toEqual(JSON.parse(JSON.stringify(snapshot)))
    expect(frameHash(restored.frame)).toBe(stored.rawFrameHash)
  })

  it('rejects a Frame overlay whose reconstructed raw hash does not match', () => {
    const { db, game, persistence, readStored } = setup()
    persistence.save('r', serializeSessionSnapshot(game.state, game), meta)
    const stored = readStored()
    stored.frameDelta.push({ op: 'add', path: '/futureTamperedField', value: true })
    db.prepare('UPDATE rooms SET state_json = ? WHERE id = ?').run(JSON.stringify(stored), 'r')
    expect(() => persistence.load('r')).toThrow(RoomHistoryCorruptionError)
    expect(() => persistence.loadReplayFrame('r')).toThrow('Room Frame hash mismatch')
  })
})
