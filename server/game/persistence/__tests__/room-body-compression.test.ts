import { createHash } from 'node:crypto'
import { createTestDatabase } from '../../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../../database/postgres'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../../authoritative-session'
import { frameHash } from '../../replay-codec'
import { stabilizeRandomHands } from '../../../__tests__/_helpers/stabilize-random-hands'
import { rehydrateState, serializeSessionSnapshot } from '../../../../shared/session/serialization'
import { PostgresRoomPersistence } from '../postgres-adapter'
import { RoomHistoryCorruptionError } from '../room-history-store'
import { parseRoomBody } from '../room-body-codec'
import type { RoomMeta } from '../room-persistence'

const meta: RoomMeta = { createdBy: null, maxPlayers: 2, customCardDbIds: [], status: 'playing', players: [] }
type RecoveryRow = { node_id: string; kind: string; body_json: string; checksum: string }
const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

const setup = async () => {
  const db = await createTestDatabase()
  cleanups.push(async () => (await db.close()))


  const game = new GameSession(563, undefined, { playerCount: 2 })
  cleanups.push(() => game.dispose())
  stabilizeRandomHands(game.state.players)
  for (const player of game.state.players) Object.assign(player.resources, { wood: 10, reed: 10 })
  game.loadState(game.state)
  expect(game.takeAction(0, 'farm-expansion').ok).toBe(true)
  const snapshot = serializeSessionSnapshot(game.state, game)
  const persistence = new PostgresRoomPersistence(db)
  ;(await persistence.save('r', snapshot, meta))
  const recoveryRows = async () => (await db.prepare('SELECT node_id, kind, body_json, checksum FROM room_recovery_nodes WHERE room_id = ?').all('r')) as RecoveryRow[]
  return { db, game, snapshot, persistence, recoveryRows }
}

describe('compressed Room recovery bodies', () => {
  it('preserves the lobby SQL turn projection for phases, empty stacks and nested frame owners', async () => {
    const { db, snapshot, persistence } = await setup()
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
      SELECT CASE WHEN r.status = 'playing' AND r.state_json IS JSON THEN
        CASE WHEN r.state_json::jsonb #>> '{state,phase}' = 'playing'
               AND (r.state_json::jsonb #>> '{state,gameOver}')::boolean IS DISTINCT FROM true
               AND COALESCE(
                     (r.state_json::jsonb #>> '{sessionCursor,engineStackCursor,frames,-1,ownerPlayerIndex}')::integer,
                     (r.state_json::jsonb #>> '{state,currentPlayerIndex}')::integer
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
      ;(await persistence.save('r', current, { ...meta, status: testCase.status }))
      const latest = ((await db.prepare('SELECT state_json FROM rooms WHERE id = ?').get('r')) as { state_json: string }).state_json
      const envelope = JSON.parse(latest) as { roomBodyEncoding: string; state: object; sessionCursor: object }
      expect(envelope.roomBodyEncoding).toBe('gzip-base64-v1')
      expect(envelope.state).toEqual({ phase: testCase.phase, gameOver: testCase.gameOver, currentPlayerIndex: testCase.currentPlayerIndex })
      expect(envelope.sessionCursor).toEqual({ engineStackCursor: { frames: testCase.owners.length ? [{ ownerPlayerIndex: testCase.owners.at(-1) }] : [] } })
      expect((await query.get({ playerIndex: testCase.playerIndex }))).toEqual({ my_turn: testCase.expected })
      expect((await persistence.load('r'))!.serialized).toEqual(JSON.parse(JSON.stringify(current)))
    }
  })

  it('compresses only packed latest and undo bodies while retaining the exact Frame, cursor and undo', async () => {
    const { db, game, snapshot, persistence, recoveryRows } = await setup()
    const latest = ((await db.prepare('SELECT state_json FROM rooms WHERE id = ?').get('r')) as { state_json: string }).state_json
    expect(JSON.parse(latest)).toMatchObject({ roomBodyEncoding: 'gzip-base64-v1' })
    const packed = parseRoomBody(latest) as { state: object; sessionCursor: object }
    expect(packed.state).toHaveProperty('historyStreams')
    expect(packed.state).not.toHaveProperty('log')
    expect(packed.state).not.toHaveProperty('events')
    expect(packed.sessionCursor).toHaveProperty('undoHistory')
    expect(packed.sessionCursor).not.toHaveProperty('history')
    const rows = (await recoveryRows())
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(JSON.parse(row.body_json)).toMatchObject({ roomBodyEncoding: 'gzip-base64-v1' })
      const body = parseRoomBody(row.body_json) as { state: object }
      expect(body.state).toHaveProperty('historyStreams')
      expect(body.state).not.toHaveProperty('log')
      expect(body.state).not.toHaveProperty('publicEventArchive')
    }
    const historyRows = (await db.prepare('SELECT record_json FROM room_history_nodes WHERE room_id = ?').all('r')) as { record_json: string }[]
    for (const row of historyRows) expect(JSON.parse(row.record_json)).not.toHaveProperty('roomBodyEncoding')

    const recovered = (await persistence.load('r'))!.serialized!
    expect(recovered).toEqual(JSON.parse(JSON.stringify(snapshot)))
    expect(frameHash(recovered.frame)).toBe(frameHash(snapshot.frame))
    const resumed = new GameSession(rehydrateState(recovered))
    cleanups.push(() => resumed.dispose())
    expect(resumed.undoAction().ok).toBe(true)
    expect(game.undoAction().ok).toBe(true)
    expect(resumed.getState()).toEqual(game.getState())
  })

  it('reads mixed raw and compressed recovery records using checksums of their actual stored text', async () => {
    const { db, snapshot, persistence, recoveryRows } = await setup()
    const row = (await recoveryRows())[0]!
    const raw = { node_id: row.node_id, kind: row.kind, body_json: JSON.stringify(parseRoomBody(row.body_json)) }
    const checksum = createHash('sha256').update(JSON.stringify(raw)).digest('hex')
    ;(await db.prepare('UPDATE room_recovery_nodes SET body_json = ?, checksum = ? WHERE room_id = ? AND node_id = ?')
      .run(raw.body_json, checksum, 'r', row.node_id))
    expect((await persistence.load('r'))!.serialized).toEqual(JSON.parse(JSON.stringify(snapshot)))

    // Whitespace leaves decoded values intact, but the stored text checksum must fail.
    ;(await db.prepare('UPDATE room_recovery_nodes SET body_json = ? WHERE room_id = ? AND node_id = ?')
      .run(`${raw.body_json} `, 'r', row.node_id))
    ;(await expect(persistence.load('r')).rejects.toThrow(RoomHistoryCorruptionError))
  })

  it('rejects damaged compressed latest state and recovery bodies', async () => {
    const { db, persistence, recoveryRows } = await setup()
    const row = (await recoveryRows())[0]!
    const damaged = '{"roomBodyEncoding":"gzip-base64-v1","data":"broken"}'
    ;(await db.prepare('UPDATE room_recovery_nodes SET body_json = ? WHERE room_id = ? AND node_id = ?')
      .run(damaged, 'r', row.node_id))
    ;(await expect(persistence.load('r')).rejects.toThrow(RoomHistoryCorruptionError))
    ;(await db.prepare('UPDATE rooms SET state_json = ? WHERE id = ?').run(damaged, 'r'))
    ;(await expect(persistence.loadReplayFrame('r')).rejects.toThrow(RoomHistoryCorruptionError))
  })
})
