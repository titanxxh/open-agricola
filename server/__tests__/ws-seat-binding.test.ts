/**
 * PR-6 Task 4 — WS seat binding tests.
 *
 * Verifies that every WS command carrying a client-supplied playerIndex or
 * playerId is cross-checked against the connection's own seat. A client
 * connected as seat 0 must not be able to submit actions, commit choices,
 * run dev mutations, or submit draft picks on seat 1 (or any other seat).
 *
 * Covers:
 *   • `commitFarm` / `commitSelection` — explicit playerIndex in payload
 *   • `devSetResources` / `devDrawCard` / `devPlayCard` — dev channel
 *   • `draftSubmit` — playerId-based identity
 *   • Happy path: own-seat commands are accepted
 *
 * Patterned after room-manager-ws-sync.test.ts.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { createWsServer } from '../game/room-manager.ts'
import type { ServerEvent } from '../../shared/protocol/ws.ts'
import type { StateUpdateEnvelope } from '../../shared/protocol/game.ts'

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
): Promise<TestSocket> => {
  const ws = new WebSocket(baseUrl) as TestSocket
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
  p1.send(
    JSON.stringify({
      type: 'createRoom',
      name: 'P1',
      maxPlayers: 2,
      ...(opts ?? {}),
    }),
  )
  const roomCreated = await waitForEvent(
    p1,
    (event): event is Extract<ServerEvent, { type: 'roomCreated' }> =>
      event.type === 'roomCreated',
  )
  const p2 = await openWs(baseUrl, sockets)
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

describe('WS seat binding', () => {
  let server: ReturnType<typeof createServer>
  let wsServer: ReturnType<typeof createWsServer>
  let baseUrl: string
  const sockets: TestSocket[] = []

  beforeEach(async () => {
    server = createServer()
    wsServer = createWsServer(server)
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
    await new Promise<void>((resolve, reject) => {
      wsServer.close((err) => {
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

  it('rejects devSetResources when the seat argument does not match the sender', async () => {
    const { p1, initialP1 } = await setupTwoPlayerRoom(baseUrl, sockets)
    const initialWood = initialP1.payload.state.players[0]!.resources.wood

    // p1 is seat 0, tries to mutate seat 1 — must be blocked.
    p1.send(
      JSON.stringify({
        type: 'devSetResources',
        playerIndex: 1,
        resources: { wood: 999 },
        requestId: 'spoof-dev-set-1',
      }),
    )
    const err = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'spoof-dev-set-1',
    )
    expect(err.error).toMatch(/seat mismatch/i)

    // Confirm state on seat 0 was not touched: getState round-trip.
    p1.send(JSON.stringify({ type: 'getState', requestId: 'check-unchanged-1' }))
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
    p1.send(
      JSON.stringify({
        type: 'devSetResources',
        playerIndex: 0,
        resources: { wood: 999 },
        requestId: 'own-dev-set-1',
      }),
    )
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
    p1.send(
      JSON.stringify({
        type: 'commitSelection',
        playerIndex: 1,
        payload: { positions: [] },
        requestId: 'spoof-commitSel-1',
      }),
    )
    const err = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'spoof-commitSel-1',
    )
    expect(err.error).toMatch(/seat mismatch/i)
  })

  it('rejects devDrawCard / devPlayCard when seat does not match', async () => {
    const { p1 } = await setupTwoPlayerRoom(baseUrl, sockets)

    p1.send(
      JSON.stringify({
        type: 'devDrawCard',
        playerIndex: 1,
        cardId: 'A3',
        requestId: 'spoof-draw-1',
      }),
    )
    const err1 = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'spoof-draw-1',
    )
    expect(err1.error).toMatch(/seat mismatch/i)

    p1.send(
      JSON.stringify({
        type: 'devPlayCard',
        playerIndex: 1,
        cardId: 'A3',
        requestId: 'spoof-play-1',
      }),
    )
    const err2 = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'error' }> =>
        event.type === 'error' && event.requestId === 'spoof-play-1',
    )
    expect(err2.error).toMatch(/seat mismatch/i)
  })

  it('rejects draftSubmit when the playerId does not belong to the sender', async () => {
    const { p1, initialP1 } = await setupTwoPlayerRoom(baseUrl, sockets, {
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
    expect(initialP1.payload.state.phase).toBe('draft')
    const otherId = initialP1.payload.state.players[1]!.id

    p1.send(
      JSON.stringify({
        type: 'draftSubmit',
        playerId: otherId,
        pick: { occCardId: null, minorCardId: null },
        requestId: 'spoof-draft-1',
      }),
    )
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
    p1.send(
      JSON.stringify({
        type: 'action',
        spaceId: openSpace!.id,
        requestId: 'own-action-1',
      }),
    )
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
