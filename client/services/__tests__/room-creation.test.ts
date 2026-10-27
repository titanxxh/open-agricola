import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'
import { serializeState } from '../../../shared/session/serialization'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import { EngineStack } from '../../../shared/engine'

class CreationSocket {
  static OPEN = 1
  static all: CreationSocket[] = []
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: Array<Record<string, unknown>> = []
  constructor(readonly url: string) { CreationSocket.all.push(this); queueMicrotask(() => this.onopen?.()) }
  send(raw: string) {
    const command = JSON.parse(raw)
    this.sent.push(command)
    if (command.type === 'getCommandScope') queueMicrotask(() => this.emit({ type: 'commandScope', scope: {
      scopeId: '01800000-0000-4000-8000-000000000001', expiresAt: Date.now() + 86400000,
    } }))
  }
  emit(message: ServerEvent) { this.onmessage?.({ data: JSON.stringify(message) }) }
  close() { this.readyState = 3; this.onclose?.() }
}

beforeEach(() => {
  CreationSocket.all = []
  const storage = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  vi.stubGlobal('window', { location: { hostname: 'localhost' } })
  vi.stubGlobal('WebSocket', CreationSocket)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ wsPath: '/nodes/creator/ws' }))))
})
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

const complete = (socket: CreationSocket, roomId: string) => {
  const command = socket.sent.find(item => item.type === 'createRoom')!
  const context = command.commandContext
  if (!context || typeof context !== 'object' || !('scopeId' in context) || !('commandId' in context)
    || typeof context.scopeId !== 'string' || typeof context.commandId !== 'string') throw new Error('Expected stable creation identity')
  socket.emit({ type: 'roomCreated', roomId, maxPlayers: 1, playerIndex: 0, playerColors: ['red'] })
  socket.emit({ type: 'stateUpdate', roomId, version: 0, sync: 'snapshot', cause: 'reconnect', emittedAt: Date.now(),
    payload: { state: serializeState(createInitialState(42, { playerCount: 1 }), { engineStack: new EngineStack() }),
      interaction: { stateId: 'idle', allowedCommands: [], anytimeActions: [] }, scores: null, historyLength: 0, hasActionStartSnapshot: false, ok: true } })
  socket.emit({ type: 'commandReceipt', status: 'completed', receipt: { scopeId: context.scopeId, commandId: context.commandId,
    outcome: { ok: true, roomId, roomVersion: 0, stepNo: 0 } } })
}

it('uses one new allocation for a double click and a fresh allocation for the next intentional creation', async () => {
  const { startRoomCreation } = await import('../room-creation')
  const first = startRoomCreation({ sourceGameContextId: 'completed-old' })
  const duplicate = startRoomCreation({ sourceGameContextId: 'completed-old' })
  await vi.waitFor(() => expect(CreationSocket.all[0]?.sent.some(command => command.type === 'createRoom')).toBe(true))
  expect(fetch).toHaveBeenCalledTimes(1)
  const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))
  expect(body).not.toHaveProperty('roomId')
  expect(body.allocationId).toBeTypeOf('string')
  expect(CreationSocket.all[0]!.sent.filter(command => command.type === 'createRoom')).toHaveLength(1)
  complete(CreationSocket.all[0]!, 'new-1')
  await expect(first).resolves.toMatchObject({ roomId: 'new-1' })
  await expect(duplicate).resolves.toMatchObject({ roomId: 'new-1' })
  const next = startRoomCreation({ sourceGameContextId: 'completed-old' })
  await vi.waitFor(() => expect(CreationSocket.all[1]?.sent.some(command => command.type === 'createRoom')).toBe(true))
  const nextBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body))
  expect(nextBody.allocationId).not.toBe(body.allocationId)
  complete(CreationSocket.all[1]!, 'new-2')
  await expect(next).resolves.toMatchObject({ roomId: 'new-2' })
})
