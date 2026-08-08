import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { createWsServer, viewerBuildExists } from '../ws-server.ts'
import { InMemoryRoomPersistence } from '../../game/persistence/memory-adapter.ts'
import type { ServerEvent } from '../../../shared/contract/protocol/ws.ts'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game.ts'

vi.mock('../../db.ts', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_updated_at INTEGER,
      email TEXT COLLATE NOCASE,
      email_verified_at INTEGER,
      email_verification_sent_at INTEGER,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE account_deletion_requests (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      requested_at INTEGER NOT NULL,
      next_attempt_at INTEGER NOT NULL,
      last_error_code TEXT
    );
  `)
  return { getDb: () => db, cleanExpiredSessions: () => {} }
})

type TestSocket = WebSocket & {
  received: ServerEvent[]
}

const countTakenSpaces = (event: StateUpdateEnvelope) =>
  event.payload.state.actionSpaces.filter((space) => space.takenBy.length > 0).length

const maxEventSeq = (events: Array<{ seq: number }>): number =>
  events.reduce((max, event) => Math.max(max, event.seq), 0)

const findTakenBy = (event: StateUpdateEnvelope, spaceId: string) =>
  event.payload.state.actionSpaces.find((space) => space.id === spaceId)?.takenBy ?? null

const attachCollector = (ws: TestSocket) => {
  ws.on('message', (raw: WebSocket.RawData) => {
    ws.received.push(JSON.parse(raw.toString()) as ServerEvent)
  })
}

describe('replay startup validation', () => {
  it('requires SQLite persistence when replay recording is enabled', () => {
    expect(() => createWsServer(createServer(), {
      persistence: new InMemoryRoomPersistence(),
      replay: {
        enabled: true,
        viewerBuildId: '0'.repeat(64),
        gameBuildId: 'game-1',
        viewerRoot: '/unused',
      },
    })).toThrow('Replay recording requires SQLite persistence')
  })

  it('accepts only content-addressed viewer builds with a complete manifest', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const root = mkdtempSync(join(tmpdir(), 'open-agricola-viewer-build-'))
    try {
      const index = Buffer.from('<!doctype html>')
      const app = Buffer.from('console.log("replay")')
      const manifest = Buffer.from(JSON.stringify({
        entrypoint: 'index.html',
        files: {
          'index.html': createHash('sha256').update(index).digest('hex'),
          'app.js': createHash('sha256').update(app).digest('hex'),
        },
      }))
      const buildId = createHash('sha256').update(manifest).digest('hex')
      const directory = join(root, buildId)
      mkdirSync(directory)
      writeFileSync(join(directory, 'index.html'), index)
      writeFileSync(join(directory, 'app.js'), app)
      writeFileSync(join(directory, 'manifest.json'), manifest)

      writeFileSync(join(directory, 'index.html'), 'changed')
      expect(viewerBuildExists(root, buildId)).toBe(false)
      writeFileSync(join(directory, 'index.html'), index)
      expect(viewerBuildExists(root, buildId)).toBe(true)
      expect(viewerBuildExists(root, 'current')).toBe(false)

      writeFileSync(join(directory, 'app.js'), 'changed')
      expect(viewerBuildExists(root, buildId)).toBe(true)
      vi.setSystemTime(60_001)
      expect(viewerBuildExists(root, buildId)).toBe(false)

      writeFileSync(join(directory, 'app.js'), app)
      expect(viewerBuildExists(root, buildId)).toBe(true)
      rmSync(join(directory, 'index.html'))
      expect(viewerBuildExists(root, buildId)).toBe(false)
    } finally {
      vi.useRealTimers()
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('fixed dev room startup persistence', () => {
  it('persists serialized Farmers of the Moor state for fixed dev rooms at startup', () => {
    const previousMoor = process.env.DEV_ENABLE_FARMERS_OF_THE_MOOR
    const previousIncomplete = process.env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL
    process.env.DEV_ENABLE_FARMERS_OF_THE_MOOR = 'true'
    process.env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL = 'true'
    const persistence = new InMemoryRoomPersistence()
    const server = createServer()
    const wsServerResult = createWsServer(server, { persistence })

    try {
      wsServerResult.checkpoint.flushAll()
      const snap = persistence.load('dev2')
      expect(snap?.serialized).toMatchObject({
        enableFarmersOfTheMoor: true,
      })
      expect(snap?.meta).toMatchObject({
        maxPlayers: 2,
        status: 'playing',
        enableFarmersOfTheMoor: true,
        allowIncompleteFarmersOfTheMoorMinorDeal: true,
      })
    } finally {
      clearInterval(wsServerResult.cleanupTimer)
      wsServerResult.wss.close()
      if (previousMoor === undefined) delete process.env.DEV_ENABLE_FARMERS_OF_THE_MOOR
      else process.env.DEV_ENABLE_FARMERS_OF_THE_MOOR = previousMoor
      if (previousIncomplete === undefined) delete process.env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL
      else process.env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL = previousIncomplete
    }
  })

  it('preserves restored direct Parent Card mode when startup has no override', () => {
    const previousParents = process.env.DEV_ENABLE_PARENT_CARDS
    const previousDraftParents = process.env.DEV_DRAFT_PARENTS
    const persistence = new InMemoryRoomPersistence()

    try {
      process.env.DEV_ENABLE_PARENT_CARDS = 'true'
      process.env.DEV_DRAFT_PARENTS = 'false'
      const first = createWsServer(createServer(), { persistence })
      try {
        first.checkpoint.flushAll()
        expect(first.registry.get('dev2')?.draftParents).toBe(false)
        expect(persistence.load('dev2')?.meta.draftParents).toBe(false)
      } finally {
        clearInterval(first.cleanupTimer)
        first.wss.close()
      }

      delete process.env.DEV_ENABLE_PARENT_CARDS
      delete process.env.DEV_DRAFT_PARENTS
      const restored = createWsServer(createServer(), { persistence })
      try {
        expect(restored.registry.get('dev2')?.draftParents).toBe(false)
      } finally {
        clearInterval(restored.cleanupTimer)
        restored.wss.close()
      }
    } finally {
      if (previousParents === undefined) delete process.env.DEV_ENABLE_PARENT_CARDS
      else process.env.DEV_ENABLE_PARENT_CARDS = previousParents
      if (previousDraftParents === undefined) delete process.env.DEV_DRAFT_PARENTS
      else process.env.DEV_DRAFT_PARENTS = previousDraftParents
    }
  })
})

const waitForOpen = async (ws: WebSocket): Promise<void> => {
  await new Promise<void>((resolve) => ws.once('open', () => resolve()))
}

const waitForEvent = async <T extends ServerEvent>(
  ws: TestSocket,
  predicate: (event: ServerEvent) => event is T,
): Promise<T> => {
  const existing = ws.received.find(predicate)
  if (existing) return existing
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', onMessage)
      ws.off('error', onError)
      reject(new Error('timed out waiting for websocket event'))
    }, 2000)
    const onMessage = () => {
      const event = ws.received.find(predicate)
      if (!event) return
      clearTimeout(timeout)
      ws.off('message', onMessage)
      ws.off('error', onError)
      resolve(event)
    }
    const onError = (err: Error) => {
      clearTimeout(timeout)
      ws.off('message', onMessage)
      ws.off('error', onError)
      reject(err)
    }
    ws.on('message', onMessage)
    ws.on('error', onError)
  })
}

describe('room-manager ws sync', () => {
  let server: ReturnType<typeof createServer>
  let wsServerResult: ReturnType<typeof createWsServer>
  let persistence: InMemoryRoomPersistence
  let baseUrl: string
  const sockets: TestSocket[] = []

  beforeEach(async () => {
    persistence = new InMemoryRoomPersistence()
    server = createServer()
    wsServerResult = createWsServer(server, { persistence })
    wsServerResult.checkpoint.flushAll()
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address() as AddressInfo
    baseUrl = `ws://127.0.0.1:${address.port}/ws`
  })

  afterEach(async () => {
    await Promise.all(
      sockets.map(
        (ws) =>
          new Promise<void>((resolve) => {
            if (ws.readyState === WebSocket.CLOSED) {
              resolve()
              return
            }
            const timeout = setTimeout(() => resolve(), 1000)
            ws.once('close', () => {
              clearTimeout(timeout)
              resolve()
            })
            if (ws.readyState === WebSocket.CONNECTING) {
              ws.once('open', () => ws.close())
              return
            }
            ws.close()
          }),
      ),
    )
    wsServerResult.checkpoint.shutdown()
    clearInterval(wsServerResult.cleanupTimer)
    await new Promise<void>((resolve, reject) => {
      wsServerResult.wss.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('flushes the room once before removing the last disconnected seat', async () => {
    const ws = new WebSocket(baseUrl) as TestSocket
    ws.received = []
    attachCollector(ws)
    sockets.push(ws)
    await waitForOpen(ws)
    ws.send(JSON.stringify({ type: 'createRoom', name: 'P1', maxPlayers: 2 }))
    const created = await waitForEvent(
      ws,
      (event): event is Extract<ServerEvent, { type: 'roomCreated' }> => event.type === 'roomCreated',
    )
    const originalSave = persistence.save.bind(persistence)
    const playerCounts: number[] = []
    const save = vi.spyOn(persistence, 'save').mockImplementation((...args) => {
      playerCounts.push(wsServerResult.registry.get(created.roomId)?.players.length ?? -1)
      originalSave(...args)
    })

    const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()))
    ws.close()
    await closed

    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenLastCalledWith(created.roomId, expect.any(Object), expect.any(Object))
    expect(playerCounts).toEqual([1])
    wsServerResult.checkpoint.flushAll()
    expect(save).toHaveBeenCalledOnce()
  })

  it('disposes a completed custom executor when the last socket disconnects', async () => {
    const ws = new WebSocket(baseUrl) as TestSocket
    ws.received = []
    attachCollector(ws)
    sockets.push(ws)
    await waitForOpen(ws)
    ws.send(JSON.stringify({ type: 'createRoom', name: 'P1', maxPlayers: 2 }))
    const created = await waitForEvent(
      ws,
      (event): event is Extract<ServerEvent, { type: 'roomCreated' }> => event.type === 'roomCreated',
    )
    const room = wsServerResult.registry.get(created.roomId)!
    const dispose = vi.fn()
    room.session.state.gameOver = true
    room.customSessionExecutor = { dispose } as never

    const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()))
    ws.close()
    await closed

    expect(dispose).toHaveBeenCalledOnce()
    expect(room.customSessionExecutor).toBeDefined()
  })

  it('accepts createRoom over websocket when oa_session cookie is valid', async () => {
    process.env.ALLOW_ANONYMOUS_WS = 'false'
    vi.resetModules()
    const { createWsServer: createWsServerWithEnv } = await import('../ws-server.ts')
    const persistence = new InMemoryRoomPersistence()
    const isolatedServer = createServer()
    const isolatedWsServerResult = createWsServerWithEnv(isolatedServer, { persistence })
    await new Promise<void>((resolve) => {
      isolatedServer.listen(0, '127.0.0.1', () => resolve())
    })
    const address = isolatedServer.address() as AddressInfo
    const isolatedBaseUrl = `ws://127.0.0.1:${address.port}/ws`
    try {
      const { createLocalUserForTests, createSession } = await import('../../auth.ts')
      const username = `wsuser_${Date.now()}`
      const user = await createLocalUserForTests(username, 'password123', 'WS User')
      const token = createSession(user.id)
      const ws = new WebSocket(isolatedBaseUrl, { headers: { Cookie: `oa_session=${token}` } }) as TestSocket
      ws.received = []
      attachCollector(ws)
      sockets.push(ws)
      await waitForOpen(ws)

      ws.send(JSON.stringify({ type: 'createRoom', maxPlayers: 2, name: 'WS User' }))

      const msg = await waitForEvent(
        ws,
        (event): event is Extract<ServerEvent, { type: 'roomCreated' }> =>
          event.type === 'roomCreated',
      )
      expect(msg.roomId).toBeTruthy()
    } finally {
      clearInterval(isolatedWsServerResult.cleanupTimer)
      isolatedWsServerResult.wss.close()
      isolatedServer.close()
      delete process.env.ALLOW_ANONYMOUS_WS
    }
  })

  it('closes websocket connections from untrusted origins before cookie auth', async () => {
    process.env.ALLOW_ANONYMOUS_WS = 'false'
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example'
    vi.resetModules()
    const { createWsServer: createWsServerWithEnv } = await import('../ws-server.ts')
    const persistence = new InMemoryRoomPersistence()
    const isolatedServer = createServer()
    const isolatedWsServerResult = createWsServerWithEnv(isolatedServer, { persistence })
    await new Promise<void>((resolve) => {
      isolatedServer.listen(0, '127.0.0.1', () => resolve())
    })
    const address = isolatedServer.address() as AddressInfo
    const isolatedBaseUrl = `ws://127.0.0.1:${address.port}/ws`
    try {
      const { createLocalUserForTests, createSession } = await import('../../auth.ts')
      const username = `wsorigin_${Date.now()}`
      const user = await createLocalUserForTests(username, 'password123', 'WS Origin')
      const token = createSession(user.id)
      const ws = new WebSocket(isolatedBaseUrl, {
        headers: {
          Cookie: `oa_session=${token}`,
          Origin: 'https://evil.example',
        },
      }) as TestSocket
      ws.received = []
      sockets.push(ws)

      const closed = await new Promise<{ code: number; reason: string }>((resolve) => {
        ws.once('close', (code, reason) => {
          resolve({ code, reason: reason.toString() })
        })
      })
      expect(closed).toEqual({ code: 1008, reason: 'invalid origin' })
    } finally {
      clearInterval(isolatedWsServerResult.cleanupTimer)
      isolatedWsServerResult.wss.close()
      isolatedServer.close()
      delete process.env.ALLOW_ANONYMOUS_WS
      delete process.env.PUBLIC_APP_ORIGIN
    }
  })

  it('can close active websocket connections for a revoked user session', async () => {
    process.env.ALLOW_ANONYMOUS_WS = 'false'
    vi.resetModules()
    const { createWsServer: createWsServerWithEnv } = await import('../ws-server.ts')
    const persistence = new InMemoryRoomPersistence()
    const isolatedServer = createServer()
    const isolatedWsServerResult = createWsServerWithEnv(isolatedServer, { persistence })
    await new Promise<void>((resolve) => {
      isolatedServer.listen(0, '127.0.0.1', () => resolve())
    })
    const address = isolatedServer.address() as AddressInfo
    const isolatedBaseUrl = `ws://127.0.0.1:${address.port}/ws`
    try {
      const { createLocalUserForTests, createSession } = await import('../../auth.ts')
      const username = `wsrevoke_${Date.now()}`
      const user = await createLocalUserForTests(username, 'password123', 'WS Revoke')
      const token = createSession(user.id)
      const ws = new WebSocket(isolatedBaseUrl, { headers: { Cookie: `oa_session=${token}` } }) as TestSocket
      ws.received = []
      sockets.push(ws)
      await waitForOpen(ws)

      const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        ws.once('close', (code, reason) => {
          resolve({ code, reason: reason.toString() })
        })
      })
      isolatedWsServerResult.closeUserConnections(user.id)

      expect(await closed).toEqual({ code: 1008, reason: 'session revoked' })
    } finally {
      clearInterval(isolatedWsServerResult.cleanupTimer)
      isolatedWsServerResult.wss.close()
      isolatedServer.close()
      delete process.env.ALLOW_ANONYMOUS_WS
    }
  })

  it('rejects non-fixed devMode-style unauthenticated room commands in production-like mode', async () => {
    process.env.ALLOW_ANONYMOUS_WS = 'false'
    vi.resetModules()
    const { createWsServer: createWsServerWithEnv } = await import('../ws-server.ts')
    const persistence = new InMemoryRoomPersistence()
    const isolatedServer = createServer()
    const isolatedWsServerResult = createWsServerWithEnv(isolatedServer, { persistence })
    await new Promise<void>((resolve) => {
      isolatedServer.listen(0, '127.0.0.1', () => resolve())
    })
    const address = isolatedServer.address() as AddressInfo
    const isolatedBaseUrl = `ws://127.0.0.1:${address.port}/ws`
    try {
      const ws = new WebSocket(isolatedBaseUrl) as TestSocket
      ws.received = []
      attachCollector(ws)
      sockets.push(ws)
      await waitForOpen(ws)

      ws.send(JSON.stringify({ type: 'createRoom', maxPlayers: 2 }))

      const msg = await waitForEvent(
        ws,
        (event): event is Extract<ServerEvent, { type: 'error' }> => event.type === 'error',
      )
      expect(msg.error).toMatch(/not authenticated|authentication timeout/)
    } finally {
      clearInterval(isolatedWsServerResult.cleanupTimer)
      isolatedWsServerResult.wss.close()
      isolatedServer.close()
      delete process.env.ALLOW_ANONYMOUS_WS
    }
  })

  it('broadcasts undo updates to both players and resyncs getState to the current version', async () => {
    const p1 = new WebSocket(baseUrl) as TestSocket
    p1.received = []
    attachCollector(p1)
    sockets.push(p1)
    await waitForOpen(p1)

    p1.send(JSON.stringify({ type: 'createRoom', name: 'P1', maxPlayers: 2 }))
    const roomCreated = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'roomCreated' }> => event.type === 'roomCreated',
    )

    const p2 = new WebSocket(baseUrl) as TestSocket
    p2.received = []
    attachCollector(p2)
    sockets.push(p2)
    await new Promise<void>((resolve) => p2.once('open', () => resolve()))

    p2.send(
      JSON.stringify({
        type: 'joinRoom',
        roomId: roomCreated.roomId,
        requestedPlayerIndex: 1,
        name: 'P2',
      }),
    )

    const initialP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope => event.type === 'stateUpdate' && event.cause === 'reconnect',
    )
    const initialP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope => event.type === 'stateUpdate' && event.cause === 'reconnect',
    )
    const initialTaken = countTakenSpaces(initialP1)
    expect(countTakenSpaces(initialP2)).toBe(initialTaken)
    const initialMaxSeq = maxEventSeq(initialP1.payload.state.events)

    const spaceId = initialP1.payload.state.actionSpaces.find((space) => space.takenBy.length === 0)?.id
    expect(spaceId).toBeTruthy()

    p1.send(JSON.stringify({ type: 'action', spaceId, requestId: 'action-1' }))
    const actionP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'action-1',
    )
    const actionP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'action-1',
    )
    const takenAfterAction = countTakenSpaces(actionP1)
    const actionMaxSeq = maxEventSeq(actionP1.payload.state.events)
    const addedEvents = actionP1.payload.state.events.filter((event) => event.seq > initialMaxSeq)
    expect(takenAfterAction).toBeGreaterThan(initialTaken)
    expect(addedEvents.length).toBeGreaterThan(0)
    expect(countTakenSpaces(actionP2)).toBe(takenAfterAction)
    expect(findTakenBy(actionP1, spaceId!)?.[0]?.playerId).toBe(actionP1.payload.state.players[0]?.id)
    expect(findTakenBy(actionP2, spaceId!)?.[0]?.playerId).toBe(actionP2.payload.state.players[0]?.id)

    p1.send(JSON.stringify({ type: 'undoStep', requestId: 'undo-1' }))
    const undoP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'undo-1' && event.cause === 'undo',
    )
    const undoP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'undo-1' && event.cause === 'undo',
    )

    expect(undoP1.version).toBe(undoP2.version)
    expect(countTakenSpaces(undoP1)).toBe(initialTaken)
    expect(countTakenSpaces(undoP2)).toBe(initialTaken)
    expect(findTakenBy(undoP1, spaceId!)).toEqual([])
    expect(findTakenBy(undoP2, spaceId!)).toEqual([])
    expect(undoP1.payload.publicEventCancellations).toEqual(undoP2.payload.publicEventCancellations)
    expect(undoP1.payload.publicEventCancellations).toEqual([{
      reason: 'undoStep',
      previousMaxSeq: actionMaxSeq,
      nextMaxSeq: initialMaxSeq,
      canceledEventIds: addedEvents.map((event) => event.id),
      canceledSeqs: addedEvents.map((event) => event.seq),
    }])

    p2.send(JSON.stringify({ type: 'getState', requestId: 'state-1' }))
    const resync = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'state-1' && event.cause === 'reconnect',
    )

    expect(resync.version).toBe(undoP1.version)
    expect(countTakenSpaces(resync)).toBe(initialTaken)
    expect(findTakenBy(resync, spaceId!)).toEqual([])
    expect(resync.payload.publicEventCancellations).toBeUndefined()
  })

  it('broadcasts devSetResources and devSetRound updates over ws', async () => {
    const p1 = new WebSocket(baseUrl) as TestSocket
    p1.received = []
    attachCollector(p1)
    sockets.push(p1)
    await new Promise<void>((resolve) => p1.once('open', () => resolve()))

    p1.send(JSON.stringify({
      type: 'joinRoom',
      roomId: 'dev2',
      requestedPlayerIndex: 0,
      name: 'P1',
    }))
    await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined',
    )

    const p2 = new WebSocket(baseUrl) as TestSocket
    p2.received = []
    attachCollector(p2)
    sockets.push(p2)
    await new Promise<void>((resolve) => p2.once('open', () => resolve()))

    p2.send(JSON.stringify({
      type: 'joinRoom',
      roomId: 'dev2',
      requestedPlayerIndex: 1,
      name: 'P2',
    }))

    const initialP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.cause === 'reconnect',
    )
    const initialP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.cause === 'reconnect',
    )
    const player0 = initialP1.payload.state.players[0]!
    const initialWood = player0.resources.wood

    p1.send(JSON.stringify({
      type: 'devSetResources',
      playerIndex: 0,
      resources: { wood: initialWood + 5 },
      requestId: 'dev-set-resources-1',
    }))

    const afterResourcesP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'dev-set-resources-1',
    )
    const afterResourcesP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'dev-set-resources-1',
    )
    expect(afterResourcesP1.payload.state.players[0]?.resources.wood).toBe(initialWood + 5)
    expect(afterResourcesP2.payload.state.players[0]?.resources.wood).toBe(initialWood + 5)

    p1.send(JSON.stringify({
      type: 'devSetRound',
      round: 6,
      requestId: 'dev-set-round-1',
    }))

    const afterRoundP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'dev-set-round-1',
    )
    const afterRoundP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'dev-set-round-1',
    )
    expect(initialP2.payload.state.players[0]?.resources.wood).toBe(initialWood)
    expect(afterRoundP1.payload.state.round).toBe(6)
    expect(afterRoundP2.payload.state.round).toBe(6)
  })

  it('forwards createRoom draftMode/draftPoolSize into the session state', async () => {
    const p1 = new WebSocket(baseUrl) as TestSocket
    p1.received = []
    attachCollector(p1)
    sockets.push(p1)
    await new Promise<void>((resolve) => p1.once('open', () => resolve()))

    p1.send(
      JSON.stringify({
        type: 'createRoom',
        name: 'P1',
        maxPlayers: 2,
        draftMode: 'simultaneous',
        draftPoolSize: 8,
      }),
    )
    const roomCreated = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'roomCreated' }> =>
        event.type === 'roomCreated',
    )

    const p2 = new WebSocket(baseUrl) as TestSocket
    p2.received = []
    attachCollector(p2)
    sockets.push(p2)
    await new Promise<void>((resolve) => p2.once('open', () => resolve()))

    p2.send(
      JSON.stringify({
        type: 'joinRoom',
        roomId: roomCreated.roomId,
        requestedPlayerIndex: 1,
        name: 'P2',
      }),
    )

    const initialP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.cause === 'reconnect',
    )
    expect(initialP2.payload.state.phase).toBe('draft')
    expect(initialP2.payload.state.draft).not.toBeNull()
    expect(initialP2.payload.state.draft?.poolSize).toBe(8)
    // After Task 13.5 removed GameSyncPayload.pending, callers detect the
    // draft phase via state.phase + state.draft (more authoritative than the
    // transitional pending-action mirror).
    expect(initialP2.payload.state.phase).toBe('draft')
    expect(initialP2.payload.interaction.stateId).toBe('idle')
    for (const player of initialP2.payload.state.players) {
      expect(player.occupationHand).toEqual([])
      expect(player.minorHand).toEqual([])
    }
  })

  it('rejects createRoom with an invalid draftPoolSize', async () => {
    const p1 = new WebSocket(baseUrl) as TestSocket
    p1.received = []
    attachCollector(p1)
    sockets.push(p1)
    await new Promise<void>((resolve) => p1.once('open', () => resolve()))

    p1.send(
      JSON.stringify({
        type: 'createRoom',
        name: 'P1',
        maxPlayers: 2,
        draftMode: 'simultaneous',
        draftPoolSize: 99,
        requestId: 'bad-draft-1',
      }),
    )
    const err = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'bad-draft-1',
    )
    expect(err.error).toMatch(/draftPoolSize/)
  })
})
