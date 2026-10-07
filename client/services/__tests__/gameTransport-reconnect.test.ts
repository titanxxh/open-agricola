import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeState } from '../../../shared/session/serialization'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import { EngineStack } from '../../../shared/engine'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'

const scope = { scopeId: '01800000-0000-4000-8000-000000000001', expiresAt: Date.now() + 86400000 }
class Socket {
  static OPEN = 1
  static all: Socket[] = []
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  sent: Array<Record<string, any>> = []
  constructor(readonly url: string) { Socket.all.push(this); queueMicrotask(() => this.onopen?.()) }
  send(raw: string) {
    const msg = JSON.parse(raw)
    this.sent.push(msg)
    if (msg.type === 'getCommandScope') queueMicrotask(() => this.emit({ type: 'commandScope', scope }))
  }
  emit(message: ServerEvent) { this.onmessage?.({ data: JSON.stringify(message) }) }
  close(code = 1000, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }) }
}
const snapshot = (version = 1, roomId = 'room-1'): ServerEvent => ({
  type: 'stateUpdate', roomId, version, sync: 'snapshot', cause: 'reconnect', emittedAt: Date.now(),
  payload: { state: serializeState(createInitialState(42), { engineStack: new EngineStack() }), interaction: { stateId: 'idle', allowedCommands: ['takeAction'], anytimeActions: [] }, scores: null, historyLength: version, hasActionStartSnapshot: false, ok: true },
})
const joined = (roomId = 'room-1'): ServerEvent => ({ type: 'roomJoined', roomId, playerIndex: 1, status: 'playing', players: [], maxPlayers: 2 })
const tick = async () => { await vi.waitFor(() => expect(Socket.all).toHaveLength(2)) }

describe('Room reconnect and durable commands', () => {
  beforeEach(() => {
    Socket.all = []
    const storage = new Map<string, string>()
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
    vi.stubGlobal('WebSocket', Socket)
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it.each([undefined, 1])('does not invent a seat before join acknowledgement (hint %s)', async (hint) => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test', 'dev2', hint, { route: false, reconnectDelayMs: 1 })
    try {
      await transport.connect()
      Socket.all[0]!.close()
      await tick()
      const next = Socket.all[1]!
      await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('joinRoom'))
      expect(next.sent.at(-1)?.requestedPlayerIndex).toBe(hint)
    } finally {
      transport.destroy()
    }
  })

  it('sends the acknowledged player seat when resuming a development room', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test', 'dev2', undefined, { route: false, reconnectDelayMs: 1 })
    try {
      await transport.connect()
      const old = Socket.all[0]!
      old.emit(joined('dev2'))
      old.emit(snapshot(1, 'dev2'))
      old.close()
      await tick()
      const next = Socket.all[1]!
      await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('joinRoom'))
      expect(next.sent.at(-1)).toMatchObject({
        type: 'joinRoom',
        roomId: 'dev2',
        intent: 'resume',
        requestedPlayerIndex: 1,
      })
      next.emit(joined('dev2'))
      expect(transport.connected).toBe(false)
      next.emit(snapshot(1, 'dev2'))
      await vi.waitFor(() => expect(transport.connected).toBe(true))
      expect(transport.playerIndex).toBe(1)
    } finally {
      transport.destroy()
    }
  })

  it('preserves an automatically assigned dev seat across a pending-command reload', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const first = new WsGameTransport('ws://test', 'dev2', undefined, { route: false })
    await first.connect()
    const old = Socket.all[0]!
    old.emit(joined('dev2'))
    old.emit(snapshot(1, 'dev2'))
    const action = first.takeAction(1, 'forest')
    const rejected = expect(action).rejects.toThrow('Transport destroyed')
    const command = old.sent.at(-1)!
    first.destroy()
    await rejected

    const restored = new WsGameTransport('ws://test', 'dev2', undefined, { route: false })
    const connection = restored.connect()
    void connection.catch(() => {})
    try {
      await tick()
      const next = Socket.all[1]!
      await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('getCommandReceipt'))
      next.emit({ type: 'commandReceipt', status: 'completed', receipt: {
        ...command.commandContext, outcome: { ok: true, roomId: 'dev2', roomVersion: 2 },
      }, requestId: next.sent.at(-1)!.requestId })
      await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('joinRoom'))
      expect(next.sent.at(-1)).toMatchObject({ intent: 'resume', requestedPlayerIndex: 1 })
      next.emit(joined('dev2'))
      expect(restored.connected).toBe(false)
      next.emit(snapshot(2, 'dev2'))
      await connection
      expect(restored.playerIndex).toBe(1)
      expect(next.sent.some(message => message.type === 'action')).toBe(false)
    } finally {
      restored.destroy()
      await connection.catch(() => {})
    }
  })

  it('looks up a lost action receipt before resuming and waits for a full snapshot', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const route = vi.fn(async () => 'ws://test/owner')
    const transport = new WsGameTransport('ws://test', 'room-1', 1, { route, reconnectDelayMs: 1 })
    const status = vi.fn(); transport.onConnectionStatus(status)
    await transport.connect()
    const old = Socket.all[0]!
    old.emit(joined()); old.emit(snapshot())
    const action = transport.takeAction(1, 'forest')
    const command = old.sent.at(-1)!
    old.close()
    await tick()
    const next = Socket.all[1]!
    await vi.waitFor(() => expect(next.sent.at(-1)).toMatchObject({ type: 'getCommandReceipt', identity: { scopeId: command.commandContext.scopeId, commandId: command.commandContext.commandId } }))
    const query = next.sent.at(-1)!
    next.emit({ type: 'commandReceipt', status: 'completed', receipt: { ...command.commandContext, outcome: { ok: true, roomId: 'room-1', roomVersion: 2 } }, requestId: query.requestId })
    await vi.waitFor(() => expect(next.sent.at(-1)).toMatchObject({ type: 'joinRoom', roomId: 'room-1', intent: 'resume' }))
    expect(route).toHaveBeenCalledTimes(2)
    next.emit(joined())
    expect(transport.connected).toBe(false)
    await expect(transport.undoStep()).rejects.toThrow(/reconnect/i)
    next.emit(snapshot(2))
    await expect(action).resolves.toMatchObject({ historyLength: 2, ok: true })
    await vi.waitFor(() => expect(transport.connected).toBe(true))
    expect(next.sent.filter(msg => msg.type === 'action')).toEqual([])
    const listener = vi.fn(); transport.onSnapshot(listener)
    old.emit(snapshot(999))
    expect(listener).not.toHaveBeenCalled()
    transport.destroy()
  })

  it('retries an uncommitted command with exactly its old identity only in the same input context', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test', 'room-1', 1, { route: false, reconnectDelayMs: 1 })
    await transport.connect()
    const old = Socket.all[0]!; old.emit(joined()); old.emit(snapshot())
    const action = transport.takeAction(1, 'forest'); const command = old.sent.at(-1)!
    old.close(); await tick()
    const next = Socket.all[1]!
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('getCommandReceipt'))
    next.emit({ type: 'commandReceipt', status: 'pending', identity: command.commandContext, requestId: next.sent.at(-1)!.requestId })
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('joinRoom'))
    next.emit(joined()); next.emit(snapshot())
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('action'))
    expect(next.sent.at(-1)?.commandContext).toEqual(command.commandContext)
    expect(next.sent.at(-1)?.requestId).not.toBe(command.requestId)
    next.emit({ type: 'commandReceipt', status: 'completed', receipt: { ...command.commandContext, outcome: { ok: true, roomId: 'room-1', roomVersion: 2 } } })
    next.emit(snapshot(2))
    await expect(action).resolves.toMatchObject({ historyLength: 2 })
    transport.destroy()
  })

  it('does not replay an old action into a newer snapshot', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test', 'room-1', 1, { route: false, reconnectDelayMs: 1 })
    const recovered = vi.fn(); transport.onRecoveryNotice(recovered)
    await transport.connect(); const old = Socket.all[0]!; old.emit(joined()); old.emit(snapshot())
    const action = transport.takeAction(1, 'forest'); const rejected = expect(action).rejects.toThrow(/choose again/)
    const command = old.sent.at(-1)!; old.close(); await tick(); const next = Socket.all[1]!
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('getCommandReceipt'))
    next.emit({ type: 'commandReceipt', status: 'unknown', identity: command.commandContext, requestId: next.sent.at(-1)!.requestId })
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('joinRoom'))
    next.emit(joined()); next.emit(snapshot(3))
    await rejected
    expect(next.sent.filter(msg => msg.type === 'action')).toEqual([])
    expect(recovered).toHaveBeenCalledWith('command_input_stale')
    transport.destroy()
  })

  it('recovers a creation whose room id reply was lost and never creates a second room', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test', undefined, undefined, { route: false, reconnectDelayMs: 1 })
    const events = vi.fn(); transport.onEvent(events)
    await transport.connect(); const old = Socket.all[0]!
    transport.sendRoomCommand('createRoom', { maxPlayers: 2 }); const command = old.sent.at(-1)!
    old.close(); await tick(); const next = Socket.all[1]!
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('getCommandReceipt'))
    next.emit({ type: 'commandReceipt', status: 'completed', receipt: { ...command.commandContext, outcome: { ok: true, roomId: 'created-room', playerIndex: 0 } }, requestId: next.sent.at(-1)!.requestId })
    await vi.waitFor(() => expect(next.sent.at(-1)).toMatchObject({ type: 'joinRoom', roomId: 'created-room', intent: 'resume' }))
    next.emit({ type: 'roomJoined', roomId: 'created-room', playerIndex: 0, status: 'waiting', players: [], maxPlayers: 2 })
    await vi.waitFor(() => expect(transport.connected).toBe(true))
    expect(transport.roomId).toBe('created-room')
    expect(next.sent.filter(msg => msg.type === 'createRoom')).toEqual([])
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'roomJoined' }))
    transport.destroy()
  })

  it('keeps the command journal across a page reload and resolves an already completed rematch before the old room', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const oldTransport = new WsGameTransport('ws://test', 'room-1', undefined, { route: false })
    await oldTransport.connect(); const old = Socket.all[0]!; old.emit(joined()); old.emit(snapshot())
    const rematch = oldTransport.newGame(42); const rejected = expect(rematch).rejects.toThrow('Transport destroyed')
    const command = old.sent.at(-1)!
    oldTransport.destroy(); await rejected
    const restored = new WsGameTransport('ws://test', 'room-1', undefined, { route: false })
    const connection = restored.connect()
    await tick(); const next = Socket.all[1]!
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('getCommandReceipt'))
    expect(next.sent.at(-1)?.identity.commandId).toBe(command.commandContext.commandId)
    next.emit({ type: 'commandReceipt', status: 'completed', receipt: { ...command.commandContext, outcome: { ok: true, roomId: 'new-room', roomVersion: 0 } }, requestId: next.sent.at(-1)!.requestId })
    await vi.waitFor(() => expect(next.sent.at(-1)).toMatchObject({ type: 'joinRoom', roomId: 'new-room', intent: 'resume' }))
    next.emit(joined('new-room')); next.emit(snapshot(0, 'new-room'))
    await connection
    expect(next.sent.some(msg => msg.type === 'newGame' || msg.roomId === 'room-1')).toBe(false)
    restored.destroy()
  })

  it('preserves a simultaneous input window when a peer advances the committed version', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test', 'room-1', 1, { route: false, reconnectDelayMs: 1 })
    await transport.connect(); const old = Socket.all[0]!; old.emit(joined())
    old.emit({ ...snapshot(), inputWindow: { id: 'draft-window', kind: 'draft' } } as ServerEvent)
    const submitted = transport.draftSubmit('p2', { occCardId: 'a', minorCardId: 'b' })
    const command = old.sent.at(-1)!
    old.close(); await tick(); const next = Socket.all[1]!
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('getCommandReceipt'))
    next.emit({ type: 'commandReceipt', status: 'pending', identity: command.commandContext, requestId: next.sent.at(-1)!.requestId })
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('joinRoom'))
    next.emit(joined()); next.emit({ ...snapshot(2), inputWindow: { id: 'draft-window', kind: 'draft' } } as ServerEvent)
    await vi.waitFor(() => expect(next.sent.at(-1)?.type).toBe('draftSubmit'))
    expect(next.sent.at(-1)?.commandContext).toEqual(command.commandContext)
    next.emit({ ...snapshot(3), requestId: next.sent.at(-1)!.requestId } as ServerEvent)
    next.emit({ type: 'commandReceipt', status: 'completed', receipt: { ...command.commandContext, outcome: { ok: true, roomId: 'room-1', roomVersion: 3 } } })
    await submitted
    transport.destroy()
  })

  it('never replaces an expired pending scope with a new command identity', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const first = new WsGameTransport('ws://test', undefined, undefined, { route: false })
    await first.connect(); first.sendRoomCommand('createRoom', { maxPlayers: 2 })
    const command = Socket.all[0]!.sent.at(-1)!
    first.destroy()
    // This connection's server refuses the old scope rather than issuing another.
    const send = vi.spyOn(Socket.prototype, 'send').mockImplementation(function (this: Socket, raw: string) {
      const message = JSON.parse(raw); this.sent.push(message)
      if (message.type === 'getCommandScope') queueMicrotask(() => this.emit({ type: 'error', code: 'command_scope_expired', error: 'Command scope expired' }))
    })
    const next = new WsGameTransport('ws://test', undefined, undefined, { route: false })
    await expect(next.connect()).rejects.toThrow('Command scope expired')
    expect(Socket.all[1]!.sent).toEqual([{ type: 'getCommandScope', scopeId: command.commandContext.scopeId }])
    next.destroy(); send.mockRestore()
  })

  it('stops on seat replacement and never opens another connection', async () => {
    const { WsGameTransport } = await import('../gameTransport')
    const transport = new WsGameTransport('ws://test', 'room-1', 1, { route: false, reconnectDelayMs: 1 })
    const status = vi.fn(); transport.onConnectionStatus(status)
    await transport.connect(); Socket.all[0]!.emit(joined()); Socket.all[0]!.emit(snapshot())
    Socket.all[0]!.emit({ type: 'seat_replaced', roomId: 'room-1', playerIndex: 1 })
    Socket.all[0]!.close(4001, 'seat replaced')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(Socket.all).toHaveLength(1)
    expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'stopped', code: 'seat_replaced' }))
    transport.destroy()
  })
})
