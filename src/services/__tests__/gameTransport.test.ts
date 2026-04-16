import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeState } from '../../../shared/game/serialization'
import { createInitialState } from '../../../shared/logic/state'
import type { GameSyncPayload, StateUpdateEnvelope } from '../../../shared/protocol/game'

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: Array<Record<string, unknown>> = []

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.())
  }

  send(raw: string) {
    this.sent.push(JSON.parse(raw) as Record<string, unknown>)
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  emit(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

const buildPayload = (historyLength: number): GameSyncPayload => ({
  state: serializeState(createInitialState(42)),
  pending: { type: 'none' },
  interaction: {
    stateId: 'idle',
    allowedCommands: ['takeAction', 'undoStep', 'undoAction'],
    anytimeActions: [],
  },
  scores: null,
  historyLength,
  hasActionStartSnapshot: false,
  ok: true,
})

const buildEnvelope = (requestId: string, historyLength: number): StateUpdateEnvelope & { requestId: string } => ({
  type: 'stateUpdate',
  roomId: 'room-1',
  version: historyLength,
  sync: 'snapshot',
  cause: 'reconnect',
  requestId,
  payload: buildPayload(historyLength),
  emittedAt: Date.now(),
})

describe('WsGameTransport request correlation', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('sends request ids and only resolves the matching pending command', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    const firstPromise = transport.getState()
    const secondPromise = transport.undoAction()

    expect(socket.sent).toHaveLength(2)
    expect(socket.sent[0]?.requestId).toBeTypeOf('string')
    expect(socket.sent[1]?.requestId).toBeTypeOf('string')
    expect(socket.sent[0]?.requestId).not.toBe(socket.sent[1]?.requestId)

    let firstResolved = false
    firstPromise.then(() => {
      firstResolved = true
    })

    socket.emit(buildEnvelope(String(socket.sent[1]?.requestId), 2))
    await Promise.resolve()

    expect(firstResolved).toBe(false)
    await expect(secondPromise).resolves.toMatchObject({ historyLength: 2 })

    socket.emit(buildEnvelope(String(socket.sent[0]?.requestId), 1))
    await expect(firstPromise).resolves.toMatchObject({ historyLength: 1 })

    transport.destroy()
  })
})
