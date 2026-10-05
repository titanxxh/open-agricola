import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { createWsServer } from '../ws-server.ts'
import { viewerBuildExists } from '../../game/replay-viewer-build'
import { serializeSessionSnapshot } from '../../../shared/session/serialization'
import { getDb } from '../../db'
import { recordingResources } from '../../__tests__/_helpers/recording'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter'
import type { ClientCommand } from '../../../shared/contract/protocol/ws'
import { afterAll } from 'vitest'
import { InMemoryRoomPersistence } from '../../game/persistence/memory-adapter.ts'
import type { ServerEvent } from '../../../shared/contract/protocol/ws.ts'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game.ts'

vi.mock('../../db.ts', async () => {
  const { createTestDatabase } = await import('../../__tests__/_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})
let recording: Awaited<ReturnType<typeof recordingResources>>
beforeEach(async () => { vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true'); recording = await recordingResources(getDb()) })
afterEach(async () => {
  await recording.close()
  await getDb().exec('TRUNCATE users, rooms, game_contexts, game_results, stored_objects, command_scopes CASCADE')
  vi.restoreAllMocks(); vi.unstubAllEnvs()
})
afterAll(async () => { await getDb().close() })

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
  it('requires PostgreSQL persistence for every hosted Room', async () => {
    ;(await expect(createWsServer(createServer(), {
      persistence: new InMemoryRoomPersistence(),
      replay: {
        viewerBuildId: '0'.repeat(64),
        gameBuildId: 'game-1',
      },
    })).rejects.toThrow('Rooms require PostgreSQL persistence'))
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
  it('persists serialized Farmers of the Moor state for fixed dev rooms at startup', async () => {
    const previousMoor = process.env.DEV_ENABLE_FARMERS_OF_THE_MOOR
    const previousIncomplete = process.env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL
    process.env.DEV_ENABLE_FARMERS_OF_THE_MOOR = 'true'
    process.env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL = 'true'
    const persistence = new PostgresRoomPersistence(getDb())
    const server = createServer()
    const wsServerResult = (await createWsServer(server, { persistence, ...recording }))

    try {
      const snap = (await persistence.load('dev2'))
      expect(snap?.serialized?.state).toMatchObject({
        enableFarmersOfTheMoor: true,
      })
      expect(snap?.meta).toMatchObject({
        maxPlayers: 2,
        status: 'playing',
        enableFarmersOfTheMoor: true,
        allowIncompleteFarmersOfTheMoorMinorDeal: true,
      })
    } finally {
      await wsServerResult.shutdown()
      if (previousMoor === undefined) delete process.env.DEV_ENABLE_FARMERS_OF_THE_MOOR
      else process.env.DEV_ENABLE_FARMERS_OF_THE_MOOR = previousMoor
      if (previousIncomplete === undefined) delete process.env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL
      else process.env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL = previousIncomplete
    }
  })

  it('preserves restored direct Parent Card mode when startup has no override', async () => {
    const previousParents = process.env.DEV_ENABLE_PARENT_CARDS
    const previousDraftParents = process.env.DEV_DRAFT_PARENTS
    const persistence = new PostgresRoomPersistence(getDb())

    try {
      process.env.DEV_ENABLE_PARENT_CARDS = 'true'
      process.env.DEV_DRAFT_PARENTS = 'false'
      const first = (await createWsServer(createServer(), { persistence, ...recording }))
      try {
        expect(first.registry.get('dev2')?.draftParents).toBe(false)
        expect((await persistence.load('dev2'))?.meta.draftParents).toBe(false)
      } finally {
        await first.shutdown()
      }

      delete process.env.DEV_ENABLE_PARENT_CARDS
      delete process.env.DEV_DRAFT_PARENTS
      const restored = (await createWsServer(createServer(), { persistence, ...recording }))
      try {
        expect(restored.registry.get('dev2')?.draftParents).toBe(false)
      } finally {
        await restored.shutdown()
      }
    } finally {
      if (previousParents === undefined) delete process.env.DEV_ENABLE_PARENT_CARDS
      else process.env.DEV_ENABLE_PARENT_CARDS = previousParents
      if (previousDraftParents === undefined) delete process.env.DEV_DRAFT_PARENTS
      else process.env.DEV_DRAFT_PARENTS = previousDraftParents
    }
  })
})

describe('server shutdown', () => {
  it('disposes room executors and clears the registry', async () => {
    const result = (await createWsServer(createServer(), {
      persistence: new PostgresRoomPersistence(getDb()), ...recording,
    }))
    const room = result.registry.get('dev2')!
    const dispose = vi.fn()
    room.customSessionExecutor = { dispose } as never

    await result.shutdown()

    expect(dispose).toHaveBeenCalledOnce()
    expect(result.registry.size()).toBe(0)
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
      reject(new Error('timed out waiting for websocket event: ' + JSON.stringify(ws.received.map(e => ({type:e.type, ...('requestId' in e ? {requestId:e.requestId}:{}), ...('error' in e?{error:e.error}:{}), ...('cause' in e?{cause:e.cause}: {})})))))
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
  let wsServerResult: Awaited<ReturnType<typeof createWsServer>>
  let persistence: PostgresRoomPersistence
  let baseUrl: string
  const sockets: TestSocket[] = []

  beforeEach(async () => {
    persistence = new PostgresRoomPersistence(getDb())
    server = createServer()
    wsServerResult = (await createWsServer(server, { persistence, ...recording }))
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
    await wsServerResult.shutdown()
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('retains durable waiting state and sets shared expiry after the last disconnect', async () => {
    const ws = new WebSocket(baseUrl) as TestSocket
    ws.received = []
    attachCollector(ws)
    sockets.push(ws)
    await waitForOpen(ws)
    await sendCommand(ws, { type: 'createRoom', name: 'P1', maxPlayers: 2 })
    const created = await waitForEvent(
      ws,
      (event): event is Extract<ServerEvent, { type: 'roomCreated' }> => event.type === 'roomCreated',
    )
    const snapshot = await persistence.load(created.roomId)
    const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()))
    ws.close(); await closed
    await vi.waitFor(() => expect(wsServerResult.registry.get(created.roomId)?.players).toHaveLength(0))
    expect(await persistence.loadReplayHead(created.roomId)).toBeNull()
    expect((await persistence.load(created.roomId))?.serialized).toEqual(snapshot?.serialized)
    await vi.waitFor(async () => expect(await recording.gameContextStore.activeExpiresAt(created.roomId)).toBeGreaterThan(Date.now()))
  })

  it('disposes a completed custom executor when the last socket disconnects', async () => {
    const ws = new WebSocket(baseUrl) as TestSocket
    ws.received = []
    attachCollector(ws)
    sockets.push(ws)
    await waitForOpen(ws)
    await sendCommand(ws, { type: 'createRoom', name: 'P1', maxPlayers: 2 })
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

    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    expect(room.customSessionExecutor).toBeDefined()
  })

  it('disposes a custom executor when an in-flight command completes an empty room', async () => {
    const ws = new WebSocket(baseUrl) as TestSocket
    ws.received = []
    attachCollector(ws)
    sockets.push(ws)
    await waitForOpen(ws)
    await sendCommand(ws, { type: 'createRoom', name: 'P1', maxPlayers: 2 })
    const created = await waitForEvent(
      ws,
      (event): event is Extract<ServerEvent, { type: 'roomCreated' }> => event.type === 'roomCreated',
    )
    const room = wsServerResult.registry.get(created.roomId)!
    room.status = 'playing'
    room.startedAt = Date.now()
    expect((await wsServerResult.committer!.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')
    const response = room.session.withCtx(() => room.session.getState())
    const dispose = vi.fn()
    let finishCommand = () => {}
    const execute = vi.fn(() => new Promise<typeof response>((resolve) => {
      finishCommand = () => {
        room.session.state.gameOver = true
        resolve(room.session.getState())
      }
    }))
    room.customSessionExecutor = { session: room.session, execute, dispose,
      serializedStateForPersistence: () => serializeSessionSnapshot(room.session.state, room.session),
      scoresForPersistence: () => room.session.getState().scores ?? [],
    } as never
    await sendCommand(ws, { type: 'action', spaceId: 'forest' })
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce())

    const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()))
    ws.close()
    await closed
    expect(dispose).not.toHaveBeenCalled()

    finishCommand()
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
  })

  it('accepts createRoom over websocket when oa_session cookie is valid', async () => {
    process.env.ALLOW_ANONYMOUS_WS = 'false'
    const { createWsServer: createWsServerWithEnv } = await import('../ws-server.ts')
    const persistence = new PostgresRoomPersistence(getDb())
    const isolatedServer = createServer()
    const isolatedWsServerResult = (await createWsServerWithEnv(isolatedServer, { persistence, ...recording }))
    await new Promise<void>((resolve) => {
      isolatedServer.listen(0, '127.0.0.1', () => resolve())
    })
    const address = isolatedServer.address() as AddressInfo
    const isolatedBaseUrl = `ws://127.0.0.1:${address.port}/ws`
    try {
      const { createLocalUserForTests, createSession } = await import('../../auth.ts')
      const username = `wsuser_${Date.now()}`
      const user = await createLocalUserForTests(username, 'password123', 'WS User')
      const token = (await createSession(user.id))
      const ws = new WebSocket(isolatedBaseUrl, { headers: { Cookie: `oa_session=${token}` } }) as TestSocket
      ws.received = []
      attachCollector(ws)
      sockets.push(ws)
      await waitForOpen(ws)

      await sendCommand(ws, { type: 'createRoom', maxPlayers: 2, name: 'WS User' })

      const msg = await waitForEvent(
        ws,
        (event): event is Extract<ServerEvent, { type: 'roomCreated' }> =>
          event.type === 'roomCreated',
      )
      expect(msg.roomId).toBeTruthy()
    } finally {
      await isolatedWsServerResult.shutdown()
      isolatedServer.close()
      delete process.env.ALLOW_ANONYMOUS_WS
    }
  })

  it('closes websocket connections from untrusted origins before cookie auth', async () => {
    process.env.ALLOW_ANONYMOUS_WS = 'false'
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example'
    const { createWsServer: createWsServerWithEnv } = await import('../ws-server.ts')
    const persistence = new PostgresRoomPersistence(getDb())
    const isolatedServer = createServer()
    const isolatedWsServerResult = (await createWsServerWithEnv(isolatedServer, { persistence, ...recording }))
    await new Promise<void>((resolve) => {
      isolatedServer.listen(0, '127.0.0.1', () => resolve())
    })
    const address = isolatedServer.address() as AddressInfo
    const isolatedBaseUrl = `ws://127.0.0.1:${address.port}/ws`
    try {
      const { createLocalUserForTests, createSession } = await import('../../auth.ts')
      const username = `wsorigin_${Date.now()}`
      const user = await createLocalUserForTests(username, 'password123', 'WS Origin')
      const token = (await createSession(user.id))
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
      await isolatedWsServerResult.shutdown()
      isolatedServer.close()
      delete process.env.ALLOW_ANONYMOUS_WS
      delete process.env.PUBLIC_APP_ORIGIN
    }
  })

  it('can close active websocket connections for a revoked user session', async () => {
    process.env.ALLOW_ANONYMOUS_WS = 'false'
    const { createWsServer: createWsServerWithEnv } = await import('../ws-server.ts')
    const persistence = new PostgresRoomPersistence(getDb())
    const isolatedServer = createServer()
    const isolatedWsServerResult = (await createWsServerWithEnv(isolatedServer, { persistence, ...recording }))
    await new Promise<void>((resolve) => {
      isolatedServer.listen(0, '127.0.0.1', () => resolve())
    })
    const address = isolatedServer.address() as AddressInfo
    const isolatedBaseUrl = `ws://127.0.0.1:${address.port}/ws`
    try {
      const { createLocalUserForTests, createSession } = await import('../../auth.ts')
      const username = `wsrevoke_${Date.now()}`
      const user = await createLocalUserForTests(username, 'password123', 'WS Revoke')
      const token = (await createSession(user.id))
      const ws = new WebSocket(isolatedBaseUrl, { headers: { Cookie: `oa_session=${token}` } }) as TestSocket
      ws.received = []
      attachCollector(ws)
      sockets.push(ws)
      await waitForOpen(ws)
      ws.send(JSON.stringify({ type: 'getCommandScope', requestId: 'ready-to-revoke' }))
      await waitForEvent(ws, (event): event is Extract<ServerEvent, { type: 'commandScope' }> => event.type === 'commandScope')

      const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        ws.once('close', (code, reason) => {
          resolve({ code, reason: reason.toString() })
        })
      })
      isolatedWsServerResult.closeUserConnections(user.id)

      expect(await closed).toEqual({ code: 1008, reason: 'session revoked' })
    } finally {
      await isolatedWsServerResult.shutdown()
      isolatedServer.close()
      delete process.env.ALLOW_ANONYMOUS_WS
    }
  })

  it('rejects non-fixed devMode-style unauthenticated room commands in production-like mode', async () => {
    process.env.ALLOW_ANONYMOUS_WS = 'false'
    const { createWsServer: createWsServerWithEnv } = await import('../ws-server.ts')
    const persistence = new PostgresRoomPersistence(getDb())
    const isolatedServer = createServer()
    const isolatedWsServerResult = (await createWsServerWithEnv(isolatedServer, { persistence, ...recording }))
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

      await sendCommand(ws, { type: 'createRoom', maxPlayers: 2 })

      const msg = await waitForEvent(
        ws,
        (event): event is Extract<ServerEvent, { type: 'error' }> => event.type === 'error',
      )
      expect(msg.error).toMatch(/not authenticated|authentication timeout/)
    } finally {
      await isolatedWsServerResult.shutdown()
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

    await sendCommand(p1, { type: 'createRoom', name: 'P1', maxPlayers: 2 })
    const roomCreated = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'roomCreated' }> => event.type === 'roomCreated',
    )

    const p2 = new WebSocket(baseUrl) as TestSocket
    p2.received = []
    attachCollector(p2)
    sockets.push(p2)
    await new Promise<void>((resolve) => p2.once('open', () => resolve()))

    await sendCommand(p2, {
        type: 'joinRoom',
        roomId: roomCreated.roomId,
        requestedPlayerIndex: 1,
        name: 'P2',
      })

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

    await sendCommand(p1, { type: 'action', spaceId, requestId: 'action-1' })
    const actionP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'action-1',
    )
    const actionP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.version === actionP1.version && event.requestId === undefined,
    )
    const takenAfterAction = countTakenSpaces(actionP1)
    const actionMaxSeq = maxEventSeq(actionP1.payload.state.events)
    const addedEvents = actionP1.payload.state.events.filter((event) => event.seq > initialMaxSeq)
    expect(takenAfterAction).toBeGreaterThan(initialTaken)
    expect(addedEvents.length).toBeGreaterThan(0)
    expect(countTakenSpaces(actionP2)).toBe(takenAfterAction)
    expect(findTakenBy(actionP1, spaceId!)?.[0]?.playerId).toBe(actionP1.payload.state.players[0]?.id)
    expect(findTakenBy(actionP2, spaceId!)?.[0]?.playerId).toBe(actionP2.payload.state.players[0]?.id)

    await sendCommand(p1, { type: 'undoStep', requestId: 'undo-1' })
    const undoP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'undo-1' && event.cause === 'undo',
    )
    const undoP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.version === undoP1.version && event.requestId === undefined && event.cause === 'undo',
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

    await sendCommand(p2, { type: 'getState', requestId: 'state-1' })
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

    await sendCommand(p1, {
      type: 'joinRoom',
      roomId: 'dev2',
      requestedPlayerIndex: 0,
      name: 'P1',
    })
    await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined',
    )

    const p2 = new WebSocket(baseUrl) as TestSocket
    p2.received = []
    attachCollector(p2)
    sockets.push(p2)
    await new Promise<void>((resolve) => p2.once('open', () => resolve()))

    await sendCommand(p2, {
      type: 'joinRoom',
      roomId: 'dev2',
      requestedPlayerIndex: 1,
      name: 'P2',
    })

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

    await sendCommand(p1, {
      type: 'devSetResources',
      playerIndex: 0,
      resources: { wood: initialWood + 5 },
      requestId: 'dev-set-resources-1',
    })

    const afterResourcesP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'dev-set-resources-1',
    )
    const afterResourcesP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.version === afterResourcesP1.version && event.requestId === undefined,
    )
    expect(afterResourcesP1.payload.state.players[0]?.resources.wood).toBe(initialWood + 5)
    expect(afterResourcesP2.payload.state.players[0]?.resources.wood).toBe(initialWood + 5)

    await sendCommand(p1, {
      type: 'devSetRound',
      round: 6,
      requestId: 'dev-set-round-1',
    })

    const afterRoundP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'dev-set-round-1',
    )
    const afterRoundP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.version === afterRoundP1.version && event.requestId === undefined,
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

    await sendCommand(p1, {
        type: 'createRoom',
        name: 'P1',
        maxPlayers: 2,
        draftMode: 'simultaneous',
        draftPoolSize: 8,
      })
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

    await sendCommand(p2, {
        type: 'joinRoom',
        roomId: roomCreated.roomId,
        requestedPlayerIndex: 1,
        name: 'P2',
      })

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

    await sendCommand(p1, {
        type: 'createRoom',
        name: 'P1',
        maxPlayers: 2,
        draftMode: 'simultaneous',
        draftPoolSize: 99,
        requestId: 'bad-draft-1',
      })
    const err = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'bad-draft-1',
    )
    expect(err.error).toMatch(/draftPoolSize/)
  })
})

// Exercise the same stable scope/identity/input contract as the browser client.
const sendCommand = async (ws: TestSocket, command: ClientCommand): Promise<void> => {
  const mutating = !['getState','getHistory','joinRoom','auth','getCommandScope','getCommandReceipt'].includes(command.type)
  if (!mutating) { ws.send(JSON.stringify(command)); return }
  const requestId = randomUUID()
  ws.send(JSON.stringify({ type: 'getCommandScope', requestId }))
  const result = await waitForEvent(ws, (event): event is Extract<ServerEvent, {type:'commandScope'|'error'}> =>
    (event.type === 'commandScope' || event.type === 'error') && event.requestId === requestId)
  if (result.type === 'error') { ws.send(JSON.stringify(command)); return }
  const state = ws.received.findLast(event => event.type === 'stateUpdate')
  const joined = ws.received.findLast(event => event.type === 'roomJoined' || event.type === 'roomCreated')
  ws.send(JSON.stringify({ ...command, commandContext: {
    scopeId: result.scope.scopeId, commandId: randomUUID(),
    ...(command.type === 'createRoom' ? {} : { roomId: joined && 'roomId' in joined ? joined.roomId : undefined,
      expectedVersion: state?.type === 'stateUpdate' ? state.version : 0,
      inputWindowId: state?.type === 'stateUpdate' ? state.inputWindow?.id : undefined }),
  } }))
}
