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
})

describe('HttpGameTransport draftSubmit', () => {
  it('POSTs to /api/game/draft-submit with playerId and pick', async () => {
    const fakePayload = {
      state: serializeState(createInitialState(42)),
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

describe('parseDraftParamsFromQuery', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('returns undefined when draftMode is missing / none / unknown', async () => {
    const { parseDraftParamsFromQuery } = await import('../gameTransport')
    expect(parseDraftParamsFromQuery('')).toBeUndefined()
    expect(parseDraftParamsFromQuery('?maxPlayers=3')).toBeUndefined()
    expect(parseDraftParamsFromQuery('?draftMode=none')).toBeUndefined()
    expect(parseDraftParamsFromQuery('?draftMode=bogus')).toBeUndefined()
  })

  it('returns simultaneous with poolSize when both are valid', async () => {
    const { parseDraftParamsFromQuery } = await import('../gameTransport')
    expect(parseDraftParamsFromQuery('?draftMode=simultaneous&draftPoolSize=8')).toEqual({
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })
    expect(parseDraftParamsFromQuery('?draftMode=simultaneous&draftPoolSize=10')).toEqual({
      draftMode: 'simultaneous',
      draftPoolSize: 10,
    })
  })

  it('drops out-of-range or non-integer poolSize but keeps draftMode', async () => {
    const { parseDraftParamsFromQuery } = await import('../gameTransport')
    for (const bad of ['6', '11', 'abc', '7.5']) {
      expect(parseDraftParamsFromQuery(`?draftMode=simultaneous&draftPoolSize=${bad}`)).toEqual({
        draftMode: 'simultaneous',
      })
    }
  })

  it('omits poolSize when missing so server chooses default', async () => {
    const { parseDraftParamsFromQuery } = await import('../gameTransport')
    expect(parseDraftParamsFromQuery('?draftMode=simultaneous')).toEqual({
      draftMode: 'simultaneous',
    })
  })
})
