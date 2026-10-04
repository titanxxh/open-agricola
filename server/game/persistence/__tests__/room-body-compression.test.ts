import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../../db'
import { GameSession } from '../../authoritative-session'
import { frameHash } from '../../replay-codec'
import { stabilizeRandomHands } from '../../../__tests__/_helpers/stabilize-random-hands'
import { rehydrateState, serializeSessionSnapshot } from '../../../../shared/session/serialization'
import { SqliteRoomPersistence } from '../sqlite-adapter'
import { RoomHistoryCorruptionError } from '../room-history-store'
import { parseRoomBody } from '../room-body-codec'
import type { RoomMeta } from '../room-persistence'

const meta: RoomMeta = { createdBy: null, maxPlayers: 2, customCardDbIds: [], status: 'playing', players: [] }
type RecoveryRow = { node_id: string; kind: string; body_json: string; checksum: string }
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
  for (const player of game.state.players) Object.assign(player.resources, { wood: 10, reed: 10 })
  game.loadState(game.state)
  expect(game.takeAction(0, 'farm-expansion').ok).toBe(true)
  const snapshot = serializeSessionSnapshot(game.state, game)
  const persistence = new SqliteRoomPersistence(db)
  persistence.save('r', snapshot, meta)
  const recoveryRows = () => db.prepare('SELECT node_id, kind, body_json, checksum FROM room_recovery_nodes WHERE room_id = ?').all('r') as RecoveryRow[]
  return { db, game, snapshot, persistence, recoveryRows }
}

describe('compressed Room recovery bodies', () => {
  it('preserves the lobby SQL turn projection for phases, empty stacks and nested frame owners', () => {
    const { db, snapshot, persistence } = setup()
    const frame = snapshot.sessionCursor.engineStackCursor.frames.at(-1)!
    expect(frame).toBeDefined()
    const cases: Array<{
      phase: typeof snapshot.state.phase
      status: RoomMeta['status']
      gameOver: boolean
      currentPlayerIndex: number
      owners: number[]
      playerIndex: number
      expected: number
    }> = [
      { phase: 'playing', status: 'playing', gameOver: false, currentPlayerIndex: 0, owners: [], playerIndex: 0, expected: 1 },
      { phase: 'playing', status: 'playing', gameOver: false, currentPlayerIndex: 0, owners: [], playerIndex: 1, expected: 0 },
      { phase: 'draft', status: 'playing', gameOver: false, currentPlayerIndex: 0, owners: [], playerIndex: 0, expected: 0 },
      { phase: 'playing', status: 'waiting', gameOver: false, currentPlayerIndex: 0, owners: [], playerIndex: 0, expected: 0 },
      { phase: 'playing', status: 'playing', gameOver: true, currentPlayerIndex: 0, owners: [], playerIndex: 0, expected: 0 },
      { phase: 'playing', status: 'playing', gameOver: false, currentPlayerIndex: 0, owners: [1], playerIndex: 1, expected: 1 },
      { phase: 'playing', status: 'playing', gameOver: false, currentPlayerIndex: 0, owners: [1], playerIndex: 0, expected: 0 },
      { phase: 'playing', status: 'playing', gameOver: false, currentPlayerIndex: 1, owners: [1, 0], playerIndex: 0, expected: 1 },
      { phase: 'playing', status: 'playing', gameOver: false, currentPlayerIndex: 0, owners: [0, 1], playerIndex: 1, expected: 1 },
    ]
    const query = db.prepare(`
      SELECT CASE WHEN r.status = 'playing' AND json_valid(r.state_json) THEN
        CASE WHEN json_extract(r.state_json, '$.state.phase') = 'playing'
               AND json_extract(r.state_json, '$.state.gameOver') IS NOT 1
               AND COALESCE(
                     json_extract(r.state_json, '$.sessionCursor.engineStackCursor.frames[#-1].ownerPlayerIndex'),
                     json_extract(r.state_json, '$.state.currentPlayerIndex')
                   ) = @playerIndex
             THEN 1 ELSE 0 END
        ELSE 0 END AS my_turn
      FROM rooms r WHERE r.id = 'r'
    `)
    for (const testCase of cases) {
      const current = {
        ...snapshot,
        state: { ...snapshot.state, phase: testCase.phase, gameOver: testCase.gameOver, currentPlayerIndex: testCase.currentPlayerIndex },
        sessionCursor: {
          ...snapshot.sessionCursor,
          engineStackCursor: {
            ...snapshot.sessionCursor.engineStackCursor,
            frames: testCase.owners.map(ownerPlayerIndex => ({ ...frame, ownerPlayerIndex })),
          },
        },
      }
      persistence.save('r', current, { ...meta, status: testCase.status })
      const latest = (db.prepare('SELECT state_json FROM rooms WHERE id = ?').get('r') as { state_json: string }).state_json
      const envelope = JSON.parse(latest) as { roomBodyEncoding: string; state: object; sessionCursor: object }
      expect(envelope.roomBodyEncoding).toBe('gzip-base64-v1')
      expect(envelope.state).toEqual({ phase: testCase.phase, gameOver: testCase.gameOver, currentPlayerIndex: testCase.currentPlayerIndex })
      expect(envelope.sessionCursor).toEqual({ engineStackCursor: { frames: testCase.owners.length ? [{ ownerPlayerIndex: testCase.owners.at(-1) }] : [] } })
      expect(query.get({ playerIndex: testCase.playerIndex })).toEqual({ my_turn: testCase.expected })
      expect(persistence.load('r')!.serialized).toEqual(JSON.parse(JSON.stringify(current)))
    }
  })

  it('compresses only packed latest and undo bodies while retaining the exact Frame, cursor and undo', () => {
    const { db, game, snapshot, persistence, recoveryRows } = setup()
    const latest = (db.prepare('SELECT state_json FROM rooms WHERE id = ?').get('r') as { state_json: string }).state_json
    expect(JSON.parse(latest)).toMatchObject({ roomBodyEncoding: 'gzip-base64-v1' })
    const packed = parseRoomBody(latest) as { state: object; sessionCursor: object }
    expect(packed.state).toHaveProperty('historyStreams')
    expect(packed.state).not.toHaveProperty('log')
    expect(packed.state).not.toHaveProperty('events')
    expect(packed.sessionCursor).toHaveProperty('undoHistory')
    expect(packed.sessionCursor).not.toHaveProperty('history')
    const rows = recoveryRows()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(JSON.parse(row.body_json)).toMatchObject({ roomBodyEncoding: 'gzip-base64-v1' })
      const body = parseRoomBody(row.body_json) as { state: object }
      expect(body.state).toHaveProperty('historyStreams')
      expect(body.state).not.toHaveProperty('log')
      expect(body.state).not.toHaveProperty('publicEventArchive')
    }
    const historyRows = db.prepare('SELECT record_json FROM room_history_nodes WHERE room_id = ?').all('r') as { record_json: string }[]
    for (const row of historyRows) expect(JSON.parse(row.record_json)).not.toHaveProperty('roomBodyEncoding')

    const recovered = persistence.load('r')!.serialized!
    expect(recovered).toEqual(JSON.parse(JSON.stringify(snapshot)))
    expect(frameHash(recovered.frame)).toBe(frameHash(snapshot.frame))
    const resumed = new GameSession(rehydrateState(recovered))
    cleanups.push(() => resumed.dispose())
    expect(resumed.undoAction().ok).toBe(true)
    expect(game.undoAction().ok).toBe(true)
    expect(resumed.getState()).toEqual(game.getState())
  })

  it('reads mixed raw and compressed recovery records using checksums of their actual stored text', () => {
    const { db, snapshot, persistence, recoveryRows } = setup()
    const row = recoveryRows()[0]!
    const raw = { node_id: row.node_id, kind: row.kind, body_json: JSON.stringify(parseRoomBody(row.body_json)) }
    const checksum = createHash('sha256').update(JSON.stringify(raw)).digest('hex')
    db.prepare('UPDATE room_recovery_nodes SET body_json = ?, checksum = ? WHERE room_id = ? AND node_id = ?')
      .run(raw.body_json, checksum, 'r', row.node_id)
    expect(persistence.load('r')!.serialized).toEqual(JSON.parse(JSON.stringify(snapshot)))

    // Whitespace leaves decoded values intact, but the stored text checksum must fail.
    db.prepare('UPDATE room_recovery_nodes SET body_json = ? WHERE room_id = ? AND node_id = ?')
      .run(`${raw.body_json} `, 'r', row.node_id)
    expect(() => persistence.load('r')).toThrow(RoomHistoryCorruptionError)
  })

  it('rejects damaged compressed latest state and recovery bodies', () => {
    const { db, persistence, recoveryRows } = setup()
    const row = recoveryRows()[0]!
    const damaged = '{"roomBodyEncoding":"gzip-base64-v1","data":"broken"}'
    db.prepare('UPDATE room_recovery_nodes SET body_json = ? WHERE room_id = ? AND node_id = ?')
      .run(damaged, 'r', row.node_id)
    expect(() => persistence.load('r')).toThrow(RoomHistoryCorruptionError)
    db.prepare('UPDATE rooms SET state_json = ? WHERE id = ?').run(damaged, 'r')
    expect(() => persistence.loadReplayFrame('r')).toThrow(RoomHistoryCorruptionError)
  })
})
