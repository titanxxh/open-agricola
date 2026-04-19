import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { createWsServer } from '../room-manager.ts'
import type { ServerEvent } from '../../shared/protocol/ws.ts'
import type { StateUpdateEnvelope } from '../../shared/protocol/game.ts'

type TestSocket = WebSocket & {
  received: ServerEvent[]
}

const countTakenSpaces = (event: StateUpdateEnvelope) =>
  event.payload.state.actionSpaces.filter((space) => space.takenBy.length > 0).length

const findTakenBy = (event: StateUpdateEnvelope, spaceId: string) =>
  event.payload.state.actionSpaces.find((space) => space.id === spaceId)?.takenBy ?? null

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
    const onMessage = () => {
      const event = ws.received.find(predicate)
      if (!event) return
      ws.off('message', onMessage)
      ws.off('error', onError)
      resolve(event)
    }
    const onError = (err: Error) => {
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

  it('broadcasts undo updates to both players and resyncs getState to the current version', async () => {
    const p1 = new WebSocket(baseUrl) as TestSocket
    p1.received = []
    attachCollector(p1)
    sockets.push(p1)
    await new Promise<void>((resolve) => p1.once('open', () => resolve()))

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
    expect(takenAfterAction).toBeGreaterThan(initialTaken)
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

    p2.send(JSON.stringify({ type: 'getState', requestId: 'state-1' }))
    const resync = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        event.type === 'stateUpdate' && event.requestId === 'state-1' && event.cause === 'reconnect',
    )

    expect(resync.version).toBe(undoP1.version)
    expect(countTakenSpaces(resync)).toBe(initialTaken)
    expect(findTakenBy(resync, spaceId!)).toEqual([])
  })

  it('broadcasts devSetResources and devSetRound updates over ws', async () => {
    const p1 = new WebSocket(baseUrl) as TestSocket
    p1.received = []
    attachCollector(p1)
    sockets.push(p1)
    await new Promise<void>((resolve) => p1.once('open', () => resolve()))

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

    p2.send(JSON.stringify({
      type: 'joinRoom',
      roomId: roomCreated.roomId,
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
})
