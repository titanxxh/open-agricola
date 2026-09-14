import { once } from 'node:events'
import { createServer } from 'node:http'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import * as database from '../../db.ts'
import { GameContextStore } from '../../game/game-context-store.ts'
import { SqliteRoomPersistence } from '../../game/persistence/sqlite-adapter.ts'
import { createConnectionCtx } from '../connection-ctx.ts'
import { dispatch } from '../room-router.ts'
import { createWsServer } from '../ws-server.ts'

describe('development room expiry', () => {
  let db: Database.Database
  let persistence: SqliteRoomPersistence
  let gameContextStore: GameContextStore
  const servers: Array<ReturnType<typeof createWsServer>> = []

  const start = (server = createServer()) => {
    const result = createWsServer(server, { persistence, gameContextStore })
    servers.push(result)
    result.checkpoint.flushAll()
    return result
  }

  const join = (result: ReturnType<typeof createWsServer>, roomId: string) => {
    const ws = { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() }
    const ctx = createConnectionCtx(ws as never, { ...result, gameContextStore }, true)
    dispatch(ctx, { type: 'joinRoom', roomId, requestedPlayerIndex: 0 })
    expect(ws.send.mock.calls.map(([raw]) => JSON.parse(raw))).toContainEqual(
      expect.objectContaining({ type: 'roomJoined', roomId, playerIndex: 0 }),
    )
    expect(ctx.currentRoom?.session.state.players[0]?.resources.wood).toBe(17)
  }

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    database.runMigrations(db, () => {})
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    persistence = new SqliteRoomPersistence(db)
    gameContextStore = new GameContextStore(db)
    const initial = start()
    const room = initial.registry.get('dev2')!
    for (const player of room.session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    room.session.state.players[0]!.resources.wood = 17
    initial.checkpoint.flushRoom(room)
    initial.shutdown()
    servers.pop()
  })

  afterEach(() => {
    for (const server of servers.splice(0)) server.shutdown()
    vi.restoreAllMocks()
    db.close()
  })

  it('keeps a fixed room joinable after disconnecting and restarting beyond seven days', async () => {
    const server = createServer()
    const result = start(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing server address')
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`)
    try {
      await once(ws, 'open')
      ws.send(JSON.stringify({ type: 'joinRoom', roomId: 'dev2', requestedPlayerIndex: 0 }))
      await vi.waitFor(() => expect(result.registry.get('dev2')?.players).toHaveLength(1))
      ws.close()
      await once(ws, 'close')
      await vi.waitFor(() => expect(result.registry.get('dev2')?.players).toHaveLength(0))
      expect(db.prepare("SELECT expires_at FROM game_contexts WHERE room_id = 'dev2'").get())
        .toEqual({ expires_at: null })
      result.shutdown()
      servers.pop()
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 24 * 60 * 60 * 1000)
      gameContextStore = new GameContextStore(db)
      join(start(), 'dev2')
    } finally {
      ws.terminate()
      server.close()
    }
  })

  it('repairs expired fixed contexts and stale development deadlines without changing saved state', () => {
    const snapshot = persistence.load('dev2')!
    const derivedId = 'dev2-00000000-0000-4000-8000-000000000000'
    persistence.save(derivedId, snapshot.serialized, snapshot.meta)
    persistence.save('ordinary-room', snapshot.serialized, snapshot.meta)
    db.prepare("UPDATE game_contexts SET lifecycle = 'expired', phase = NULL WHERE room_id = 'dev2'").run()
    db.prepare("UPDATE game_contexts SET expires_at = 1 WHERE lifecycle = 'active'").run()
    gameContextStore.setActiveExpiry('ordinary-room', 1)
    expect(db.prepare("SELECT expires_at FROM game_contexts WHERE room_id = 'ordinary-room'").get())
      .toEqual({ expires_at: 1 })

    const result = start()

    expect(persistence.load('dev2')?.serialized).toEqual(snapshot.serialized)
    expect(persistence.load(derivedId)?.serialized).toEqual(snapshot.serialized)
    expect(persistence.load('ordinary-room')).toBeNull()
    for (const roomId of ['dev2', 'dev6', derivedId]) {
      expect(gameContextStore.lifecycle(roomId)).toBe('active')
      expect(gameContextStore.activeExpiresAt(roomId)).toBeNull()
    }
    join(result, 'dev2')
    join(result, derivedId)
  })

  it('keeps terminal contexts retired and restores a fixed room after an explicit reset', () => {
    const snapshot = persistence.load('dev2')!
    const derivedId = 'dev2-00000000-0000-4000-8000-000000000000'
    persistence.save(derivedId, snapshot.serialized, snapshot.meta)
    persistence.save('ordinary-room', snapshot.serialized, snapshot.meta)
    db.prepare("UPDATE game_contexts SET lifecycle = 'expired' WHERE room_id IN (?, ?)")
      .run(derivedId, 'ordinary-room')
    db.prepare("UPDATE game_contexts SET lifecycle = 'completed' WHERE room_id = 'dev3'").run()
    db.prepare("UPDATE game_contexts SET lifecycle = 'removed' WHERE room_id = 'dev4'").run()
    persistence.discard('dev2')

    start()

    expect(gameContextStore.lifecycle('dev2')).toBe('active')
    expect(gameContextStore.lifecycle('dev3')).toBe('completed')
    expect(gameContextStore.lifecycle('dev4')).toBe('removed')
    expect(gameContextStore.lifecycle(derivedId)).toBe('expired')
    expect(gameContextStore.lifecycle('ordinary-room')).toBe('expired')
  })
})
