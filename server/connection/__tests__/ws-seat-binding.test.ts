import * as database from '../../db'
import { sendCommand } from '../../__tests__/_helpers/command-socket'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import { recordingResources } from '../../__tests__/_helpers/recording'
/**
 * PR-6 Task 4 — WS seat binding tests.
 *
 * Verifies that WS commands carrying a client-supplied playerIndex or playerId
 * are cross-checked against the connection's own seat unless the command is an
 * explicitly global fixed-dev-room helper.
 *
 * Covers:
 *   • `commitSelection` — explicit playerIndex in payload
 *   • `devSetResources` / `devDrawCard` — seat-bound dev channel
 *   • `devPlayCard` — fixed-dev-room cross-seat exception
 *   • `draftSubmit` — playerId-based identity
 *   • Happy path: own-seat commands are accepted
 *
 * Patterned after room-manager-ws-sync.test.ts.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { createWsServer } from '../ws-server.ts'
import { createLocalUserForTests, createSession } from '../../auth.ts'
import { SESSION_COOKIE } from '../../auth-cookies.ts'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter.ts'
import type { ServerEvent } from '../../../shared/contract/protocol/ws.ts'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game.ts'

type TestSocket = WebSocket & {
  received: ServerEvent[]
}

const attachCollector = (ws: TestSocket) => {
  ws.on('message', (raw: WebSocket.RawData) => {
    ws.received.push(JSON.parse(raw.toString()) as ServerEvent)
  })
}

const waitForEvent = async <T extends ServerEvent>(
  ws: TestSocket,
  predicate: (event: ServerEvent) => event is T,
): Promise<T> => {
  const existing = ws.received.find(predicate)
  if (existing) return existing
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      ws.off('error', onError)
      reject(new Error('waitForEvent timed out'))
    }, 4000)
    const onMessage = () => {
      const event = ws.received.find(predicate)
      if (!event) return
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
      resolve(event)
    }
    const onError = (err: Error) => {
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
      reject(err)
    }
    ws.on('message', onMessage)
    ws.on('error', onError)
  })
}

const openWs = async (
  baseUrl: string,
  sockets: TestSocket[],
  sessionToken?: string,
): Promise<TestSocket> => {
  const ws = new WebSocket(baseUrl, sessionToken
    ? { headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` } }
    : undefined) as TestSocket
  ws.received = []
  attachCollector(ws)
  sockets.push(ws)
  await new Promise<void>((resolve) => ws.once('open', () => resolve()))
  return ws
}

const setupTwoPlayerRoom = async (
  baseUrl: string,
  sockets: TestSocket[],
  opts?: { draftMode?: 'simultaneous'; draftPoolSize?: number },
) => {
  const p1 = await openWs(baseUrl, sockets)
  await sendCommand(p1, {
      type: 'createRoom',
      name: 'P1',
      maxPlayers: 2,
      ...(opts ?? {}),
    })
  const roomCreated = await waitForEvent(
    p1,
    (event): event is Extract<ServerEvent, { type: 'roomCreated' }> =>
      event.type === 'roomCreated',
  )
  const p2 = await openWs(baseUrl, sockets)
  await sendCommand(p2, {
      type: 'joinRoom',
      roomId: roomCreated.roomId,
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
  return { p1, p2, initialP1, initialP2, roomId: roomCreated.roomId }
}

const setupFixedDevRoom = async (
  baseUrl: string,
  sockets: TestSocket[],
) => {
  const p1 = await openWs(baseUrl, sockets)
  await sendCommand(p1, {
    type: 'joinRoom',
    roomId: 'dev2',
    requestedPlayerIndex: 0,
    name: 'P1',
  })
  await waitForEvent(
    p1,
    (event): event is Extract<ServerEvent, { type: 'roomJoined' }> =>
      event.type === 'roomJoined',
  )

  const p2 = await openWs(baseUrl, sockets)
  await sendCommand(p2, {
    type: 'joinRoom',
    roomId: 'dev2',
    requestedPlayerIndex: 1,
    name: 'P2',
  })
  await waitForEvent(
    p2,
    (event): event is Extract<ServerEvent, { type: 'roomJoined' }> =>
      event.type === 'roomJoined',
  )
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

  return { p1, p2, initialP1, initialP2 }
}

describe('WS seat binding', () => {
  let server: ReturnType<typeof createServer>
  let wsServerResult: Awaited<ReturnType<typeof createWsServer>>
  let baseUrl: string
  const sockets: TestSocket[] = []
  let db: Awaited<ReturnType<typeof createTestDatabase>>
  let recording: Awaited<ReturnType<typeof recordingResources>>

  beforeEach(async () => {
    db = await createTestDatabase()
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true')
    recording = await recordingResources(db)
    const persistence = new PostgresRoomPersistence(db)
    server = createServer()
    wsServerResult = await createWsServer(server, { persistence, ...recording })
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
    sockets.length = 0
    await wsServerResult?.shutdown()
    await recording?.close()
    await db?.close()
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('lets one logged-in developer join p1 and p2 and resume only p2', async () => {
    for (const player of wsServerResult.registry.get('dev2')!.session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const user = await createLocalUserForTests('developer', 'test-password')
    const token = await createSession(user.id)
    expect(token).toBeTruthy()
    const p1 = await openWs(baseUrl, sockets, token!)
    await sendCommand(p1, { type: 'joinRoom', roomId: 'dev2', requestedPlayerIndex: 0 })
    expect(await waitForEvent(p1, (event): event is Extract<ServerEvent, { type: 'roomJoined' | 'error' }> =>
      event.type === 'roomJoined' || event.type === 'error',
    )).toMatchObject({ type: 'roomJoined', playerIndex: 0 })

    const p2 = await openWs(baseUrl, sockets, token!)
    await sendCommand(p2, { type: 'joinRoom', roomId: 'dev2', requestedPlayerIndex: 1 })
    expect(await waitForEvent(p2, (event): event is Extract<ServerEvent, { type: 'roomJoined' | 'error' }> =>
      event.type === 'roomJoined' || event.type === 'error',
    )).toMatchObject({ type: 'roomJoined', playerIndex: 1 })

    const resumed = await openWs(baseUrl, sockets, token!)
    await sendCommand(resumed, { type: 'joinRoom', roomId: 'dev2', intent: 'resume', requestedPlayerIndex: 1 })
    expect(await waitForEvent(resumed, (event): event is Extract<ServerEvent, { type: 'roomJoined' | 'error' }> =>
      event.type === 'roomJoined' || event.type === 'error',
    )).toMatchObject({ type: 'roomJoined', playerIndex: 1 })
    const state = await waitForEvent(resumed, (event): event is StateUpdateEnvelope => event.type === 'stateUpdate')
    expect(state.payload.state.players[1]!.minorHand).not.toContain('?')
    expect(state.payload.state.players[0]!.minorHand).toContain('?')
    await waitForEvent(p2, (event): event is Extract<ServerEvent, { type: 'seat_replaced' }> => event.type === 'seat_replaced')
    expect(p1.readyState).toBe(WebSocket.OPEN)
    expect(p1.received.some(event => event.type === 'seat_replaced')).toBe(false)
    expect(wsServerResult.registry.get('dev2')!.seatOwners).toEqual([
      { playerIndex: 0, userId: user.id },
      { playerIndex: 1, userId: user.id },
    ])
  })

  it('allows an anonymous local developer to resume the requested dev seat', async () => {
    const original = await openWs(baseUrl, sockets)
    await sendCommand(original, { type: 'joinRoom', roomId: 'dev2', requestedPlayerIndex: 1 })
    await waitForEvent(original, (event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined')

    const resumed = await openWs(baseUrl, sockets)
    await sendCommand(resumed, { type: 'joinRoom', roomId: 'dev2', intent: 'resume', requestedPlayerIndex: 1 })
    expect(await waitForEvent(resumed, (event): event is Extract<ServerEvent, { type: 'roomJoined' | 'error' }> =>
      event.type === 'roomJoined' || event.type === 'error',
    )).toMatchObject({ type: 'roomJoined', playerIndex: 1 })
  })

  it('rejects devSetResources when the seat argument does not match the sender', async () => {
    const { p1, initialP1 } = await setupTwoPlayerRoom(baseUrl, sockets)
    const initialWood = initialP1.payload.state.players[0]!.resources.wood

    // p1 is seat 0, tries to mutate seat 1 — must be blocked.
    await sendCommand(p1, {
        type: 'devSetResources',
        playerIndex: 1,
        resources: { wood: 999 },
        requestId: 'spoof-dev-set-1',
      })
    const err = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'spoof-dev-set-1',
    )
    expect(err.error).toMatch(/seat mismatch/i)

    // Confirm state on seat 0 was not touched: getState round-trip.
    await sendCommand(p1, { type: 'getState', requestId: 'check-unchanged-1' })
    const check = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'check-unchanged-1',
    )
    expect(check.payload.state.players[0]!.resources.wood).toBe(initialWood)
    expect(check.payload.state.players[1]!.resources.wood).not.toBe(999)
  })

  it('rejects devSetResources in a normal room even when the seat matches the sender', async () => {
    const { p1 } = await setupTwoPlayerRoom(baseUrl, sockets)
    await sendCommand(p1, {
        type: 'devSetResources',
        playerIndex: 0,
        resources: { wood: 999 },
        requestId: 'own-dev-set-1',
      })
    const result = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> | StateUpdateEnvelope =>
        (event.type === 'error' || event.type === 'stateUpdate') &&
        event.requestId === 'own-dev-set-1',
    )
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.error).toMatch(/dev commands disabled/i)
    }
  })

  it('rejects commitSelection with a playerIndex that is not the sender seat', async () => {
    const { p1 } = await setupTwoPlayerRoom(baseUrl, sockets)
    await sendCommand(p1, {
        type: 'commitSelection',
        playerIndex: 1,
        payload: { positions: [] },
        requestId: 'spoof-commitSel-1',
      })
    const err = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'spoof-commitSel-1',
    )
    expect(err.error).toMatch(/seat mismatch/i)
  })

  it('rejects devDrawCard when seat does not match', async () => {
    const { p1 } = await setupTwoPlayerRoom(baseUrl, sockets)

    await sendCommand(p1, {
        type: 'devDrawCard',
        playerIndex: 1,
        cardId: 'A3',
        requestId: 'spoof-draw-1',
      })
    const err1 = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'spoof-draw-1',
    )
    expect(err1.error).toMatch(/seat mismatch/i)
  })

  it('accepts devPlayCard for a different seat in fixed dev rooms', async () => {
    const { p2 } = await setupFixedDevRoom(baseUrl, sockets)

    await sendCommand(p2, {
        type: 'devPlayCard',
        playerIndex: 0,
        cardId: 'D025_WitchesDanceFloor',
        requestId: 'spoof-play-1',
      })
    const afterPlay = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'spoof-play-1',
    )
    expect(afterPlay.payload.state.players[0]!.minorPlayed).toContain('D025_WitchesDanceFloor')
    expect(afterPlay.payload.state.players[1]!.minorPlayed).not.toContain('D025_WitchesDanceFloor')
  })

  it('rejects draftSubmit when the playerId does not belong to the sender', async () => {
    const { p1, initialP1 } = await setupTwoPlayerRoom(baseUrl, sockets, {
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
    expect(initialP1.payload.state.phase).toBe('draft')
    const otherId = initialP1.payload.state.players[1]!.id

    await sendCommand(p1, {
        type: 'draftSubmit',
        playerId: otherId,
        pick: { occCardId: null, minorCardId: null },
        requestId: 'spoof-draft-1',
      })
    const err = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'spoof-draft-1',
    )
    expect(err.error).toMatch(/seat mismatch/i)
  })

  it('accepts takeAction from the sender seat (no regression)', async () => {
    const { p1, initialP1 } = await setupTwoPlayerRoom(baseUrl, sockets)
    const openSpace = initialP1.payload.state.actionSpaces.find(
      (s) => s.takenBy.length === 0,
    )
    expect(openSpace).toBeTruthy()
    await sendCommand(p1, {
        type: 'action',
        spaceId: openSpace!.id,
        requestId: 'own-action-1',
      })
    const afterAction = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'own-action-1',
    )
    expect(
      afterAction.payload.state.actionSpaces.find((s) => s.id === openSpace!.id)
        ?.takenBy.length,
    ).toBeGreaterThan(0)
  })
})
