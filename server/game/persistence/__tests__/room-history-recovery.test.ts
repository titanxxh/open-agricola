import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../../db'
import { GameSession } from '../../authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../../../shared/session/serialization'
import { SqliteRoomPersistence } from '../sqlite-adapter'
import { RoomHistoryCorruptionError } from '../room-history-store'
import type { RoomMeta } from '../room-persistence'

const meta: RoomMeta = { createdBy: null, maxPlayers: 2, customCardDbIds: [], status: 'playing', players: [] }
const session = () => {
  const game = new GameSession(563, undefined, { playerCount: 2 })
  for (const player of game.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    Object.assign(player.resources, { wood: 10, reed: 10 })
  }
  game.loadState(game.state)
  return game
}
const database = () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, () => {})
  return db
}

describe('Room-owned history recovery', () => {
  it('rolls back new history and the Room when a history record write fails, then retries the frozen snapshot', () => {
    const db = database()
    let fail = false
    const persistence = new SqliteRoomPersistence({
      transaction: db.transaction.bind(db),
      prepare: (sql: string) => {
        const statement = db.prepare(sql)
        if (!sql.includes('INSERT INTO room_history_nodes')) return statement
        return new Proxy(statement, { get(target, key) {
          if (key === 'run') return (...args: unknown[]) => {
            if (fail) throw new Error('history write failed')
            return Reflect.apply(target.run, target, args)
          }
          const value = Reflect.get(target, key)
          return typeof value === 'function' ? value.bind(target) : value
        } })
      },
    })
    const game = session()
    const before = serializeSessionSnapshot(game.state, game)
    persistence.save('r', before, meta)
    expect(game.takeAction(0, 'forest').ok).toBe(true)
    const frozen = serializeSessionSnapshot(game.state, game)
    fail = true
    expect(() => persistence.save('r', frozen, meta)).toThrow('history write failed')
    expect(persistence.load('r')!.serialized).toEqual(JSON.parse(JSON.stringify(before)))
    fail = false
    persistence.save('r', frozen, meta)
    const restored = new GameSession(rehydrateState(persistence.load('r')!.serialized!))
    expect(restored.getState()).toEqual(game.getState())
    expect(restored.resolveChoice(1, 'confirm').ok).toBe(true)
    expect(restored.takeAction(1, 'clay-pit').ok).toBe(true)
    db.close()
  })
  it('preserves frozen raw names and same-length replacement branches and rejects missing records', () => {
    const db = database()
    const persistence = new SqliteRoomPersistence(db)
    const game = session()
    game.state.log = [{ key: 'log.placeFarmer', playerId: 'p1', params: { player: 'Before', action: 'forest' } }]
    const first = serializeSessionSnapshot(game.state, game)
    persistence.save('r', first, meta)
    game.updatePlayerName(0, 'After')
    game.state.log = [{ key: 'log.placeFarmer', playerId: 'p1', params: { player: 'After', action: 'reed-bank' } }]
    const second = serializeSessionSnapshot(game.state, game)
    persistence.save('r', second, meta)
    expect(persistence.load('r')!.serialized!.state.log).toEqual([{ key: 'log.placeFarmer', playerId: 'p1', params: { player: 'After', action: 'reed-bank' } }])
    persistence.save('r', first, meta)
    expect(persistence.loadReplayFrame('r')!.log).toEqual([{ key: 'log.placeFarmer', playerId: 'p1', params: { player: 'Before', action: 'forest' } }])
    db.exec("DELETE FROM room_history_nodes WHERE room_id = 'r'")
    expect(() => persistence.load('r')).toThrow(RoomHistoryCorruptionError)
    db.close()
  })

})
