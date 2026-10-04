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
  it('preserves own prototype-named keys and undefined values through command rollback', () => {
    const game = session()
    const data = JSON.parse('{"__proto__":{"marker":true}}') as Record<string, unknown>
    data.missing = undefined
    game.state.players[0]!.cardStates.A075_LumberMill = { extraData: data }
    const checkpoint = game.createCommandCheckpoint()
    const captured = checkpoint.state.players[0]!.cardStates.A075_LumberMill!.extraData!
    expect(Object.hasOwn(captured, '__proto__')).toBe(true)
    expect(Object.hasOwn(captured, 'missing')).toBe(true)
    expect(Object.getPrototypeOf(captured)).toBe(Object.prototype)
    game.state.players[0]!.cardStates.A075_LumberMill!.extraData = { changed: true }
    game.restoreCommandCheckpoint(checkpoint)
    const restored = game.state.players[0]!.cardStates.A075_LumberMill!.extraData!
    expect(restored).toEqual(data)
    expect(Object.hasOwn(restored, '__proto__')).toBe(true)
    expect(Object.hasOwn(restored, 'missing')).toBe(true)
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype)
  })

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
    game.loadState({ ...game.state, log: [{ key: 'log.placeFarmer', playerId: 'p1', params: { player: 'Before', action: 'forest' } }] })
    const first = serializeSessionSnapshot(game.state, game)
    persistence.save('r', first, meta)
    game.updatePlayerName(0, 'After')
    game.loadState({ ...game.state, log: [{ key: 'log.placeFarmer', playerId: 'p1', params: { player: 'After', action: 'reed-bank' } }] })
    const second = serializeSessionSnapshot(game.state, game)
    persistence.save('r', second, meta)
    expect(persistence.load('r')!.serialized!.state.log).toEqual([{ key: 'log.placeFarmer', playerId: 'p1', params: { player: 'After', action: 'reed-bank' } }])
    persistence.save('r', first, meta)
    expect(persistence.loadReplayFrame('r')!.log).toEqual([{ key: 'log.placeFarmer', playerId: 'p1', params: { player: 'Before', action: 'forest' } }])
    db.exec("DELETE FROM room_history_nodes WHERE room_id = 'r'")
    expect(() => persistence.load('r')).toThrow(RoomHistoryCorruptionError)
    db.close()
  })

  it('makes ordinary undo reference writes atomic and preserves restart undo', () => {
    const db = database()
    let fail = true
    const persistence = new SqliteRoomPersistence({
      transaction: db.transaction.bind(db),
      prepare: (sql: string) => {
        const statement = db.prepare(sql)
        if (!sql.includes('INSERT INTO room_recovery_nodes')) return statement
        return new Proxy(statement, { get(target, key) {
          if (key === 'run') return (...args: unknown[]) => {
            if (fail) throw new Error('undo write failed')
            return Reflect.apply(target.run, target, args)
          }
          const value = Reflect.get(target, key)
          return typeof value === 'function' ? value.bind(target) : value
        } })
      },
    })
    const game = session()
    const before = JSON.parse(JSON.stringify(game.getState()))
    expect(game.takeAction(0, 'farm-expansion').ok).toBe(true)
    const captured = serializeSessionSnapshot(game.state, game)
    expect(() => persistence.save('r', captured, meta)).toThrow('undo write failed')
    expect(persistence.load('r')).toBeNull()
    fail = false
    persistence.save('r', captured, meta)
    const restored = new GameSession(rehydrateState(persistence.load('r')!.serialized!))
    expect(restored.undoAction().ok).toBe(true)
    expect(restored.getState().state.players).toEqual(before.state.players)
    expect(serializeSessionSnapshot(restored.state, restored).state.actionSpaces).toEqual(before.state.actionSpaces)
    expect(restored.getState().interaction).toEqual(before.interaction)
    expect(JSON.parse(JSON.stringify(restored.getState().scores))).toEqual(before.scores)
    db.close()
  })

  it('atomically stores provisional checkpoints and resumes a protected cross-player payment flow', () => {
    const db = database()
    let fail = true
    const persistence = new SqliteRoomPersistence({
      transaction: db.transaction.bind(db),
      prepare: (sql: string) => {
        const statement = db.prepare(sql)
        if (!sql.includes('INSERT INTO room_recovery_nodes')) return statement
        return new Proxy(statement, { get(target, key) {
          if (key === 'run') return (...args: unknown[]) => {
            if (fail && (args[0] as { kind: string }).kind === 'checkpoint') throw new Error('checkpoint write failed')
            return Reflect.apply(target.run, target, args)
          }
          const value = Reflect.get(target, key)
          return typeof value === 'function' ? value.bind(target) : value
        } })
      },
    })
    const game = session()
    game.state.round = 6
    game.state.players[0]!.houseType = 'clay'
    game.state.players[0]!.minorPlayed = ['D014_HammerCrusher']
    Object.assign(game.state.players[0]!.resources, { clay: 5, reed: 2, stone: 2 })
    game.state.players[1]!.occupationPlayed = ['D128_BuildingTycoon']
    game.loadState(game.state)
    let response = game.takeAction(0, 'house-redevelopment')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected construct choice')
    response = game.resolveChoice(0, response.interaction.request.options.find(option => option.value !== '__skip__')!.value)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected room choice')
    response = game.commitSelectionChoice(0, { rooms: [response.interaction.request.farm.selectableTiles[0]!] })
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
      response = game.resolveChoice(response.interaction.playerIndex, 'confirm')
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, sourceCard: 'D128_BuildingTycoon' })
    const snapshot = serializeSessionSnapshot(game.state, game)
    expect(() => persistence.save('r', snapshot, meta)).toThrow('checkpoint write failed')
    expect(persistence.load('r')).toBeNull()
    fail = false
    persistence.save('r', snapshot, meta)
    const restored = new GameSession(rehydrateState(persistence.load('r')!.serialized!))
    expect(restored.getState()).toEqual(game.getState())
    expect(restored.undoStep().ok).toBe(false)
    response = restored.resolveChoice(1, '__skip__')
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
      response = restored.resolveChoice(response.interaction.playerIndex, 'confirm')
    }
    expect(response.ok).toBe(true)
    expect(response.state.players[0]).toMatchObject({ rooms: 2, resources: { clay: 7, reed: 3, stone: 2 } })
    expect(response.state.log.filter(entry => entry.key === 'log.provisionalContinuationRollback')).toHaveLength(1)
    db.close()
  })
  it('atomically stores exact Frame-only history versions and future derived fields', () => {
    const db = database()
    let fail = true
    const persistence = new SqliteRoomPersistence({
      transaction: db.transaction.bind(db),
      prepare: (sql: string) => {
        const statement = db.prepare(sql)
        if (!sql.includes('INSERT INTO room_history_nodes')) return statement
        return new Proxy(statement, { get(target, key) {
          if (key === 'run') return (...args: unknown[]) => {
            if (fail && (args[0] as { record_json: string }).record_json.includes('frameOnlyCapture')) throw new Error('Frame history write failed')
            return Reflect.apply(target.run, target, args)
          }
          const value = Reflect.get(target, key)
          return typeof value === 'function' ? value.bind(target) : value
        } })
      },
    })
    const game = session()
    const snapshot = serializeSessionSnapshot(game.state, game)
    snapshot.frame.log = [{ key: 'frameOnlyCapture', playerId: 'p1', params: { player: 'Original mixed name' } }]
    Object.assign(snapshot.frame, { futureProjection: { exactValue: 1234 }, scores: [{ playerId: 'p1', total: -7 }] })
    expect(() => persistence.save('r', snapshot, meta)).toThrow('Frame history write failed')
    expect(persistence.load('r')).toBeNull()
    fail = false
    persistence.save('r', snapshot, meta)
    game.updatePlayerName(0, 'Current display name')
    expect(persistence.loadReplayFrame('r')).toEqual(snapshot.frame)
    expect(persistence.load('r')!.serialized!.frame).toEqual(snapshot.frame)
    db.close()
  })

})
