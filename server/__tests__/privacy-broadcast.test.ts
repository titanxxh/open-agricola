import * as database from '../db'
import { sendCommand } from './_helpers/command-socket'
import { createTestDatabase } from './_helpers/postgres'
import { recordingResources } from './_helpers/recording'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { createWsServer } from '../connection/ws-server.ts'
import { PostgresRoomPersistence } from '../game/persistence/postgres-adapter.ts'
import type { ServerEvent } from '../../shared/contract/protocol/ws.ts'
import type { StateUpdateEnvelope } from '../../shared/contract/protocol/game.ts'

/**
 * WebSocket broadcast privacy: every `stateUpdate` envelope must be filtered
 * per viewer — the receiving player's own hand is visible, every other
 * player's hand is masked to same-length '?' arrays (see
 * `serializeStateForPlayer`).
 *
 * Mirrors the harness used in `room-manager-ws-sync.test.ts`.
 */

type TestSocket = WebSocket & { received: ServerEvent[] }

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

const isStateUpdate = (event: ServerEvent): event is StateUpdateEnvelope =>
  event.type === 'stateUpdate'

const isReconnectState = (event: ServerEvent): event is StateUpdateEnvelope =>
  isStateUpdate(event) && event.cause === 'reconnect'

describe('WS broadcast per-viewer filter', () => {
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

  const connectSocket = async (): Promise<TestSocket> => {
    const ws = new WebSocket(baseUrl) as TestSocket
    ws.received = []
    attachCollector(ws)
    sockets.push(ws)
    await new Promise<void>((resolve) => ws.once('open', () => resolve()))
    return ws
  }

  const openTwoPlayerRoom = async (
    extraCreate: Record<string, unknown> = {},
  ): Promise<{
    p1: TestSocket
    p2: TestSocket
    initialP1: StateUpdateEnvelope
    initialP2: StateUpdateEnvelope
  }> => {
    const p1 = await connectSocket()
    await sendCommand(p1, {
        type: 'createRoom',
        name: 'P1',
        maxPlayers: 2,
        ...extraCreate,
      })
    const roomCreated = await waitForEvent(
      p1,
      (event): event is Extract<ServerEvent, { type: 'roomCreated' }> =>
        event.type === 'roomCreated',
    )

    const p2 = await connectSocket()
    await sendCommand(p2, {
        type: 'joinRoom',
        roomId: roomCreated.roomId,
        requestedPlayerIndex: 1,
        name: 'P2',
      })

    const initialP1 = await waitForEvent(p1, isReconnectState)
    const initialP2 = await waitForEvent(p2, isReconnectState)
    return { p1, p2, initialP1, initialP2 }
  }

  const pickFirst = (state: StateUpdateEnvelope['payload']['state'], playerId: string) => {
    const pool = state.draft!.pools[playerId]
    return {
      occCardId: pool.occ[0]!,
      minorCardId: pool.minor[0]!,
    }
  }

  const submitDraftWs = async (
    ws: TestSocket,
    playerId: string,
    state: StateUpdateEnvelope['payload']['state'],
    requestId: string,
  ) => {
    const pick = pickFirst(state, playerId)
    await sendCommand(ws, {
        type: 'draftSubmit',
        playerId,
        pick,
        requestId,
      })
    return pick
  }

  const joinTwoPlayerDevRoom = async (): Promise<{
    p1: TestSocket
    p2: TestSocket
    initialP1: StateUpdateEnvelope
    initialP2: StateUpdateEnvelope
  }> => {
    const p1 = await connectSocket()
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

    const p2 = await connectSocket()
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

    const initialP1 = await waitForEvent(p1, isReconnectState)
    const initialP2 = await waitForEvent(p2, isReconnectState)
    return { p1, p2, initialP1, initialP2 }
  }

  it('each ws receives its own hand; the opponent hand is masked with same-length ?', async () => {
    const { initialP1, initialP2 } = await openTwoPlayerRoom()

    const p1AsP1 = initialP1.payload.state.players[0]!
    const p2AsP1 = initialP1.payload.state.players[1]!
    const p1AsP2 = initialP2.payload.state.players[0]!
    const p2AsP2 = initialP2.payload.state.players[1]!

    // Sanity: both envelopes saw the same player count and ids.
    expect(p1AsP1.id).toBe('p1')
    expect(p2AsP1.id).toBe('p2')
    expect(p1AsP2.id).toBe('p1')
    expect(p2AsP2.id).toBe('p2')

    // Viewer = p1 → own hand is the real string payload (no '?')
    expect(p1AsP1.occupationHand.length).toBeGreaterThan(0)
    expect(p1AsP1.minorHand.length).toBeGreaterThan(0)
    expect(p1AsP1.occupationHand.every((c) => c !== '?')).toBe(true)
    expect(p1AsP1.minorHand.every((c) => c !== '?')).toBe(true)

    // Viewer = p1 → opponent p2's hand is masked to same-length '?'
    expect(p2AsP1.occupationHand.length).toBe(p2AsP2.occupationHand.length)
    expect(p2AsP1.minorHand.length).toBe(p2AsP2.minorHand.length)
    expect(p2AsP1.occupationHand.every((c) => c === '?')).toBe(true)
    expect(p2AsP1.minorHand.every((c) => c === '?')).toBe(true)

    // Viewer = p2 → own hand visible
    expect(p2AsP2.occupationHand.every((c) => c !== '?')).toBe(true)
    expect(p2AsP2.minorHand.every((c) => c !== '?')).toBe(true)

    // Viewer = p2 → opponent p1's hand masked
    expect(p1AsP2.occupationHand.length).toBe(p1AsP1.occupationHand.length)
    expect(p1AsP2.minorHand.length).toBe(p1AsP1.minorHand.length)
    expect(p1AsP2.occupationHand.every((c) => c === '?')).toBe(true)
    expect(p1AsP2.minorHand.every((c) => c === '?')).toBe(true)

    // The two sockets must genuinely see DIFFERENT card strings for each own
    // hand — otherwise both players would know both hands.
    expect(p1AsP1.occupationHand).not.toEqual(p1AsP2.occupationHand)
    expect(p2AsP2.occupationHand).not.toEqual(p2AsP1.occupationHand)
  })

  it('withholds the game seed and unrevealed round cards from both seats', async () => {
    const { initialP1, initialP2 } = await openTwoPlayerRoom()

    for (const envelope of [initialP1, initialP2]) {
      const { state } = envelope.payload
      expect(state).not.toHaveProperty('gameSeed')
      // Only round 1 has started; every later round card stays face down.
      expect(state.roundActionOrder.map((actionId) => actionId !== null)).toEqual([
        true, false, false, false, false, false, false, false, false, false, false, false, false, false,
      ])
    }
    expect(initialP1.payload.state.roundActionOrder).toEqual(initialP2.payload.state.roundActionOrder)
  })

  it('a dev room keeps the round-card order but still withholds the seed', async () => {
    const { initialP1, initialP2 } = await joinTwoPlayerDevRoom()

    for (const envelope of [initialP1, initialP2]) {
      const { state } = envelope.payload
      expect(state).not.toHaveProperty('gameSeed')
      expect(state.roundActionOrder).toHaveLength(14)
      expect(state.roundActionOrder.every((actionId) => typeof actionId === 'string')).toBe(true)
    }
    // Per-seat redaction is unchanged: the opponent's hand is still masked.
    expect(initialP1.payload.state.players[1]!.occupationHand.every((card) => card === '?')).toBe(true)
  })

  it('action broadcast keeps per-viewer filtering', async () => {
    const { p1, p2, initialP1 } = await openTwoPlayerRoom()

    const freeSpace = 'forest'
    expect(freeSpace).toBeTruthy()

    await sendCommand(p1, {
        type: 'action',
        spaceId: freeSpace,
        requestId: 'action-1',
      })

    const actionP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        isStateUpdate(event) && event.requestId === 'action-1',
    )
    const actionP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        isStateUpdate(event) && event.version === actionP1.version,
    )

    // p1 sees own hand, p2 masked
    expect(
      actionP1.payload.state.players[0]!.occupationHand.every((c) => c !== '?'),
    ).toBe(true)
    expect(
      actionP1.payload.state.players[1]!.occupationHand.every((c) => c === '?'),
    ).toBe(true)

    // p2 sees own hand, p1 masked
    expect(
      actionP2.payload.state.players[1]!.occupationHand.every((c) => c !== '?'),
    ).toBe(true)
    expect(
      actionP2.payload.state.players[0]!.occupationHand.every((c) => c === '?'),
    ).toBe(true)

    // Public mutation (action taken) is identical across viewers
    const spaceP1 = actionP1.payload.state.actionSpaces.find(
      (s) => s.id === freeSpace,
    )!
    const spaceP2 = actionP2.payload.state.actionSpaces.find(
      (s) => s.id === freeSpace,
    )!
    expect(spaceP1.takenBy.length).toBe(1)
    expect(spaceP2.takenBy.length).toBe(1)
    expect(spaceP1.takenBy[0]?.playerId).toBe('p1')
    expect(spaceP2.takenBy[0]?.playerId).toBe('p1')
  })

  it('draft room: each player sees only own pool; opponent pool masked', async () => {
    const { initialP1, initialP2 } = await openTwoPlayerRoom({
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })

    expect(initialP1.payload.state.phase).toBe('draft')
    expect(initialP2.payload.state.phase).toBe('draft')
    expect(initialP1.payload.state.draft).not.toBeNull()
    expect(initialP2.payload.state.draft).not.toBeNull()

    const p1Draft = initialP1.payload.state.draft!
    const p2Draft = initialP2.payload.state.draft!

    // p1 sees its own pool as real strings
    expect(p1Draft.pools.p1.occ.length).toBe(7)
    expect(p1Draft.pools.p1.minor.length).toBe(7)
    expect(p1Draft.pools.p1.occ.every((c) => c !== '?')).toBe(true)
    expect(p1Draft.pools.p1.minor.every((c) => c !== '?')).toBe(true)

    // p1 sees p2's pool masked to same-length '?'
    expect(p1Draft.pools.p2.occ.length).toBe(7)
    expect(p1Draft.pools.p2.minor.length).toBe(7)
    expect(p1Draft.pools.p2.occ.every((c) => c === '?')).toBe(true)
    expect(p1Draft.pools.p2.minor.every((c) => c === '?')).toBe(true)

    // p2 sees its own pool as real strings
    expect(p2Draft.pools.p2.occ.every((c) => c !== '?')).toBe(true)
    expect(p2Draft.pools.p2.minor.every((c) => c !== '?')).toBe(true)
    // p2 sees p1's pool masked
    expect(p2Draft.pools.p1.occ.every((c) => c === '?')).toBe(true)
    expect(p2Draft.pools.p1.minor.every((c) => c === '?')).toBe(true)

    // Public draft fields identical across viewers
    expect(p1Draft.round).toBe(p2Draft.round)
    expect(p1Draft.totalRounds).toBe(p2Draft.totalRounds)
    expect(p1Draft.poolSize).toBe(p2Draft.poolSize)
    expect(p1Draft.seatOrder).toEqual(p2Draft.seatOrder)
    expect(p1Draft.mode).toBe(p2Draft.mode)
  })

  it('draftSubmit broadcasts private draftUpdated only to the submitter', async () => {
    const { p1, p2, initialP1 } = await openTwoPlayerRoom({
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
    const pick = await submitDraftWs(p1, 'p1', initialP1.payload.state, 'draft-p1-r1')

    const p1Update = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        isStateUpdate(event) && event.requestId === 'draft-p1-r1',
    )
    const p2Update = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        isStateUpdate(event) && event.version === p1Update.version,
    )

    expect(p1Update.payload.privateEvents).toEqual([
      {
        schemaVersion: 1,
        type: 'private.draftUpdated',
        recipientPlayerId: 'p1',
        round: 1,
        totalRounds: 7,
        picked: pick,
        poolCounts: { occ: 6, minor: 6 },
        keptCounts: { occ: 1, minor: 1 },
        advanced: false,
        finished: false,
      },
    ])
    expect(p2Update.payload.privateEvents ?? []).toEqual([])
    expect(p2Update.payload.state.draft!.pendingPicks.p1).toEqual({ occ: '?', minor: '?' })
  })

  it('draft finalization broadcasts each player their final handChanged event', async () => {
    const { p1, p2, initialP1, initialP2 } = await openTwoPlayerRoom({
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
    let p1State = initialP1.payload.state
    let p2State = initialP2.payload.state

    for (let round = 1; round <= 6; round += 1) {
      const p1RequestId = `draft-p1-r${round}`
      const p2RequestId = `draft-p2-r${round}`
      await submitDraftWs(p1, 'p1', p1State, p1RequestId)
      const p1AfterP1 = await waitForEvent(
        p1,
        (event): event is StateUpdateEnvelope =>
          isStateUpdate(event) && event.requestId === p1RequestId,
      )
      const p2AfterP1 = await waitForEvent(
        p2,
        (event): event is StateUpdateEnvelope =>
          isStateUpdate(event) && event.version === p1AfterP1.version,
      )

      await submitDraftWs(p2, 'p2', p2AfterP1.payload.state, p2RequestId)
      const p1AfterP2 = await waitForEvent(
        p1,
        (event): event is StateUpdateEnvelope =>
          isStateUpdate(event) && event.version === p1AfterP1.version + 1,
      )
      const p2AfterP2 = await waitForEvent(
        p2,
        (event): event is StateUpdateEnvelope =>
          isStateUpdate(event) && event.requestId === p2RequestId,
      )

      p1State = p1AfterP2.payload.state
      p2State = p2AfterP2.payload.state
    }

    const p1FinalEvent = p1State.players[0]!.occupationHand.concat(p1State.players[0]!.minorHand)
    const p2FinalEvent = p2State.players[1]!.occupationHand.concat(p2State.players[1]!.minorHand)
    const p2FinalUpdate = p2.received.filter(isStateUpdate).findLast((event) => event.requestId === 'draft-p2-r6')!
    const p1FinalUpdate = p1.received.filter(isStateUpdate).findLast((event) => event.version === p2FinalUpdate.version)!

    expect(p1FinalUpdate.payload.privateEvents).toEqual([
      expect.objectContaining({
        type: 'private.handChanged',
        recipientPlayerId: 'p1',
        cardIds: p1FinalEvent,
        cardType: 'mixed',
        reason: 'draft-finalized',
      }),
    ])
    expect(p2FinalUpdate.payload.privateEvents).toEqual([
      expect.objectContaining({
        type: 'private.draftUpdated',
        recipientPlayerId: 'p2',
        advanced: true,
        finished: true,
      }),
      expect.objectContaining({
        type: 'private.handChanged',
        recipientPlayerId: 'p2',
        cardIds: p2FinalEvent,
        cardType: 'mixed',
        reason: 'draft-finalized',
      }),
    ])
  })

  it('reconnect getState returns the viewer-specific filter for that ws', async () => {
    const { p1, p2 } = await openTwoPlayerRoom()

    await sendCommand(p1, { type: 'getState', requestId: 'state-p1' })
    const stateP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        isStateUpdate(event) && event.requestId === 'state-p1',
    )

    await sendCommand(p2, { type: 'getState', requestId: 'state-p2' })
    const stateP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        isStateUpdate(event) && event.requestId === 'state-p2',
    )

    // p1 getState reply: own hand visible, p2 masked
    expect(
      stateP1.payload.state.players[0]!.occupationHand.every((c) => c !== '?'),
    ).toBe(true)
    expect(
      stateP1.payload.state.players[1]!.occupationHand.every((c) => c === '?'),
    ).toBe(true)

    // p2 getState reply: own hand visible, p1 masked
    expect(
      stateP2.payload.state.players[1]!.occupationHand.every((c) => c !== '?'),
    ).toBe(true)
    expect(
      stateP2.payload.state.players[0]!.occupationHand.every((c) => c === '?'),
    ).toBe(true)
  })

  it('devDrawCard broadcasts private handChanged only to the target player', async () => {
    const { p1, p2 } = await joinTwoPlayerDevRoom()

    await sendCommand(p1, {
        type: 'devDrawCard',
        playerIndex: 0,
        cardId: 'A116_WoodCutter',
        requestId: 'draw-private-1',
      })

    const drawP1 = await waitForEvent(
      p1,
      (event): event is StateUpdateEnvelope =>
        isStateUpdate(event) && event.requestId === 'draw-private-1',
    )
    const drawP2 = await waitForEvent(
      p2,
      (event): event is StateUpdateEnvelope =>
        isStateUpdate(event) && event.version === drawP1.version,
    )

    expect(drawP1.payload.privateEvents).toEqual([
      {
        schemaVersion: 1,
        type: 'private.handChanged',
        recipientPlayerId: 'p1',
        cardIds: ['A116_WoodCutter'],
        cardType: 'occupation',
        reason: 'dev-draw-card',
      },
    ])
    expect(drawP2.payload.privateEvents ?? []).toEqual([])
  })
})
