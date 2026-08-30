import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeState } from '../../../shared/session/serialization'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import type { GameSyncPayload, StateUpdateEnvelope } from '../../../shared/contract/protocol/game'
import { EngineStack } from '../../../shared/engine'

const emptyCtx = () => ({ engineStack: new EngineStack() })

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
  state: serializeState(createInitialState(42), emptyCtx()),
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

  it('requests an unredacted snapshot for developer state saves', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    const pending = transport.getState({ unredacted: true })

    expect(socket.sent[0]).toMatchObject({ type: 'getState', unredacted: true })
    socket.emit(buildEnvelope(String(socket.sent[0]?.requestId), 1))
    await pending
    transport.destroy()
  })

  it('switches its room reference from each authoritative state envelope', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test', 'old-room')
    const listener = vi.fn()
    transport.onSnapshot(listener)
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    socket.emit(buildEnvelope('server-event', 1))

    expect(transport.roomId).toBe('room-1')
    expect(listener).toHaveBeenCalledWith(expect.any(Object), 'room-1')
    transport.destroy()
  })

  it('reports room persistence pause and resume events', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test', 'room-1')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    socket.emit({ type: 'roomPersistencePaused', roomId: 'room-1' })
    const listener = vi.fn()
    transport.onPersistenceStatus(listener)
    socket.emit({ type: 'roomPersistenceResumed', roomId: 'room-1' })

    expect(listener.mock.calls).toEqual([[true], [false]])
    transport.destroy()
  })

  it('sends dedicated dev commands for setResources and setRound', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    const setResourcesPromise = transport.devSetResources(1, { wood: 7, clay: 3 })
    const setRoundPromise = transport.devSetRound(6)

    expect(socket.sent[0]).toMatchObject({
      type: 'devSetResources',
      playerIndex: 1,
      resources: { wood: 7, clay: 3 },
    })
    expect(socket.sent[1]).toMatchObject({
      type: 'devSetRound',
      round: 6,
    })

    socket.emit(buildEnvelope(String(socket.sent[0]?.requestId), 3))
    socket.emit(buildEnvelope(String(socket.sent[1]?.requestId), 4))

    await expect(setResourcesPromise).resolves.toMatchObject({ historyLength: 3 })
    await expect(setRoundPromise).resolves.toMatchObject({ historyLength: 4 })

    transport.destroy()
  })

  it('threads optional payload into choice msg', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    const ctx = { animal: 'sheep', count: 2 }
    const choicePromise = transport.resolveChoice(0, 'option-a', ctx)

    expect(socket.sent[0]).toMatchObject({
      type: 'choice',
      value: 'option-a',
      payload: ctx,
    })

    socket.emit(buildEnvelope(String(socket.sent[0]?.requestId), 9))
    await expect(choicePromise).resolves.toMatchObject({ historyLength: 9 })

    transport.destroy()
  })

  it('omits payload field when not provided in choice msg', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    const choicePromise = transport.resolveChoice(0, 'option-b')

    expect(socket.sent[0]).toMatchObject({
      type: 'choice',
      value: 'option-b',
    })
    expect(socket.sent[0]?.payload).toBeUndefined()

    socket.emit(buildEnvelope(String(socket.sent[0]?.requestId), 10))
    await expect(choicePromise).resolves.toMatchObject({ historyLength: 10 })

    transport.destroy()
  })

  it('sends draftSubmit with playerId and pick payload', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    const pick = { occCardId: 'occ-12', minorCardId: 'min-34' }
    const submitPromise = transport.draftSubmit('p1', pick)

    expect(socket.sent[0]).toMatchObject({
      type: 'draftSubmit',
      playerId: 'p1',
      pick,
    })
    expect(socket.sent[0]?.requestId).toBeTypeOf('string')

    socket.emit(buildEnvelope(String(socket.sent[0]?.requestId), 5))
    await expect(submitPromise).resolves.toMatchObject({ historyLength: 5 })

    transport.destroy()
  })

  it('sends parentSubmit with playerIndex and selection payload', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    const selection = { mother: 'PR01', father: 'PS01' } as const
    const submitPromise = transport.parentSubmit(0, selection)

    expect(socket.sent[0]).toMatchObject({
      type: 'parentSubmit',
      playerIndex: 0,
      selection,
    })
    expect(socket.sent[0]?.requestId).toBeTypeOf('string')

    socket.emit(buildEnvelope(String(socket.sent[0]?.requestId), 6))
    await expect(submitPromise).resolves.toMatchObject({ historyLength: 6 })

    transport.destroy()
  })

  it('sends ordinaryDrawKeep with playerIndex, choiceId, and keepCardId', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    const keepPromise = transport.ordinaryDrawKeep(1, 'ordinary-card-draw-7', 'minor-a')

    expect(socket.sent[0]).toMatchObject({
      type: 'ordinaryDrawKeep',
      playerIndex: 1,
      choiceId: 'ordinary-card-draw-7',
      keepCardId: 'minor-a',
    })
    expect(socket.sent[0]?.requestId).toBeTypeOf('string')

    socket.emit(buildEnvelope(String(socket.sent[0]?.requestId), 11))
    await expect(keepPromise).resolves.toMatchObject({ historyLength: 11 })

    transport.destroy()
  })

  it('sends Farmers of the Moor special actions as dedicated specialAction commands', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test')
    await transport.connect()

    const socket = FakeWebSocket.instances[0]!
    const payload = { tile: { row: 1, col: 2 } }
    const specialActionPromise = transport.takeSpecialAction(
      0,
      'moor-special-cut-peat',
      'cut-peat',
      payload,
    )

    expect(socket.sent[0]).toMatchObject({
      type: 'specialAction',
      cardId: 'moor-special-cut-peat',
      actionId: 'cut-peat',
      payload,
    })
    expect(socket.sent[0]).not.toMatchObject({ type: 'action' })
    expect(socket.sent[0]?.requestId).toBeTypeOf('string')

    socket.emit(buildEnvelope(String(socket.sent[0]?.requestId), 13))
    await expect(specialActionPromise).resolves.toMatchObject({ historyLength: 13 })

    transport.destroy()
  })
})

describe('HttpGameTransport parentSubmit', () => {
  it('POSTs to /api/game/parent-submit with playerIndex and selection', async () => {
    const fakePayload = {
      state: serializeState(createInitialState(42), emptyCtx()),
      pending: { type: 'none' },
      interaction: { stateId: 'idle', allowedCommands: [], anytimeActions: [] },
      scores: null,
      historyLength: 9,
      hasActionStartSnapshot: false,
      ok: true,
    }
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        json: async () => fakePayload,
      } as unknown as Response
    })
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
    vi.stubGlobal('fetch', fakeFetch)
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    try {
      const { HttpGameTransport } = await import('../gameTransport')
      const transport = new HttpGameTransport()
      const selection = { mother: 'PR02', father: 'PS02' } as const
      const payload = await transport.parentSubmit(1, selection)

      expect(calls).toHaveLength(1)
      expect(calls[0]?.url).toMatch(/\/api\/game\/parent-submit$/)
      expect(calls[0]?.init?.method).toBe('POST')
      const body = JSON.parse(String(calls[0]?.init?.body)) as unknown
      expect(body).toEqual({ playerIndex: 1, selection })
      expect(payload).toEqual(fakePayload)

      transport.destroy()
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})

describe('HttpGameTransport ordinaryDrawKeep', () => {
  it('POSTs to /api/game/ordinary-draw/keep with playerIndex, choiceId, and keepCardId', async () => {
    const fakePayload = {
      state: serializeState(createInitialState(42), emptyCtx()),
      pending: { type: 'none' },
      interaction: { stateId: 'idle', allowedCommands: [], anytimeActions: [] },
      scores: null,
      historyLength: 12,
      hasActionStartSnapshot: false,
      ok: true,
    }
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        json: async () => fakePayload,
      } as unknown as Response
    })
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
    vi.stubGlobal('fetch', fakeFetch)
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    try {
      const { HttpGameTransport } = await import('../gameTransport')
      const transport = new HttpGameTransport()
      const payload = await transport.ordinaryDrawKeep(0, 'ordinary-card-draw-2', 'occ-a')

      expect(calls).toHaveLength(1)
      expect(calls[0]?.url).toMatch(/\/api\/game\/ordinary-draw\/keep$/)
      expect(calls[0]?.init?.method).toBe('POST')
      const body = JSON.parse(String(calls[0]?.init?.body)) as unknown
      expect(body).toEqual({ playerIndex: 0, choiceId: 'ordinary-card-draw-2', keepCardId: 'occ-a' })
      expect(payload).toEqual(fakePayload)

      transport.destroy()
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})

describe('HttpGameTransport draftSubmit', () => {
  it('POSTs to /api/game/draft-submit with playerId and pick', async () => {
    const fakePayload = {
      state: serializeState(createInitialState(42), emptyCtx()),
      pending: { type: 'none' },
      interaction: { stateId: 'idle', allowedCommands: [], anytimeActions: [] },
      scores: null,
      historyLength: 7,
      hasActionStartSnapshot: false,
      ok: true,
    }
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        json: async () => fakePayload,
      } as unknown as Response
    })
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
    vi.stubGlobal('fetch', fakeFetch)
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    try {
      const { HttpGameTransport } = await import('../gameTransport')
      const transport = new HttpGameTransport()
      const pick = { occCardId: 'occ-99', minorCardId: 'min-11' }
      const payload = await transport.draftSubmit('p2', pick)

      expect(calls).toHaveLength(1)
      expect(calls[0]?.url).toMatch(/\/api\/game\/draft-submit$/)
      expect(calls[0]?.init?.method).toBe('POST')
      const body = JSON.parse(String(calls[0]?.init?.body)) as unknown
      expect(body).toEqual({ playerId: 'p2', pick })
      expect(payload).toEqual(fakePayload)

      transport.destroy()
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})

describe('HttpGameTransport resolveChoice', () => {
  it('POSTs to /api/game/choice with playerIndex, value and optional payload', async () => {
    const fakePayload = {
      state: serializeState(createInitialState(42), emptyCtx()),
      pending: { type: 'none' },
      interaction: { stateId: 'idle', allowedCommands: [], anytimeActions: [] },
      scores: null,
      historyLength: 8,
      hasActionStartSnapshot: false,
      ok: true,
    }
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        json: async () => fakePayload,
      } as unknown as Response
    })
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
    vi.stubGlobal('fetch', fakeFetch)
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    try {
      const { HttpGameTransport } = await import('../gameTransport')
      const transport = new HttpGameTransport()

      const ctx = { animal: 'cattle', count: 1 }
      await transport.resolveChoice(0, 'opt-x', ctx)
      expect(calls).toHaveLength(1)
      expect(calls[0]?.url).toMatch(/\/api\/game\/choice$/)
      expect(calls[0]?.init?.method).toBe('POST')
      const bodyWithPayload = JSON.parse(String(calls[0]?.init?.body)) as unknown
      expect(bodyWithPayload).toEqual({ playerIndex: 0, value: 'opt-x', payload: ctx })

      await transport.resolveChoice(1, 'opt-y')
      expect(calls).toHaveLength(2)
      const bodyWithoutPayload = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>
      expect(bodyWithoutPayload).toMatchObject({ playerIndex: 1, value: 'opt-y' })
      expect(bodyWithoutPayload.payload).toBeUndefined()

      transport.destroy()
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})
