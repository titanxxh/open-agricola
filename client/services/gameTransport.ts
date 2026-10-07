import { markRequest, responseReceived, snapshotReceived, observeBrowser } from './observability'
import type { RoomDiscoveryResponse } from '../../shared/contract/protocol/routing'
import { RoomCommandJournal } from './room-command-journal'
import type { CommandScope, InputWindow, CommandOutcome } from '../../shared/contract/protocol/commands'
import type { RoomHistoryPage } from '../../shared/contract/protocol/history'
import type { GameSyncPayload } from '../../shared/contract/protocol/game'
import type { ClientCommand, ServerEvent } from '../../shared/contract/protocol/ws'
import type { DraftPickPayload } from '../../shared/draft/types'
import type { ParentSelectionSubmission, Resource, ResourceBatchExchangePayload } from '../../shared/contract/types'
import type { MoorSpecialActionId } from '../../shared/moor/types'

export type ValidateResult = {
  valid: boolean
  error?: unknown
}

export type SnapshotListener = (payload: GameSyncPayload, roomId?: string) => void
export type PersistenceStatusListener = (paused: boolean) => void
export type GetStateOptions = { unredacted?: boolean }

type CommitSelectionPayload = {
  cancel?: boolean
  positions?: { row: number; col: number }[]
  cardIds?: string[]
  resourceCounts?: Partial<Record<keyof Resource, number>>
  resourceBatchExchange?: ResourceBatchExchangePayload
  edges?: string[]
  palisadeEdges?: string[]
  extraWood?: number
  fenceSources?: Record<string, string>
  rooms?: { row: number; col: number }[]
  stables?: { row: number; col: number }[]
  farmHand?: { row: number; col: number }
  tile?: { row: number; col: number }
  crops?: { row: number; col: number; crop: 'grain' | 'vegetable' | 'wood' | 'stone' }[]
}

type MoorSpecialActionPayload = {
  tile?: { row: number; col: number }
}

export interface GameTransport {
  getState(options?: GetStateOptions): Promise<GameSyncPayload>
  getHistory?(cursor?: string): Promise<RoomHistoryPage>
  takeAction(playerIndex: number, spaceId: string): Promise<GameSyncPayload>
  takeSpecialAction(
    playerIndex: number,
    cardId: string,
    actionId: MoorSpecialActionId,
    payload?: MoorSpecialActionPayload,
  ): Promise<GameSyncPayload>
  resolveChoice(
    playerIndex: number,
    value: string,
    payload?: Record<string, unknown>,
  ): Promise<GameSyncPayload>
  takeAnytimeAction(playerIndex: number, actionId: string): Promise<GameSyncPayload>
  ordinaryDrawKeep(playerIndex: number, choiceId: string, keepCardId: string): Promise<GameSyncPayload>
  commitSelection(playerIndex: number, payload: CommitSelectionPayload): Promise<GameSyncPayload>
  confirmFeed(playerIndex: number, selections: {
    count: number;
    sourceName?: string;
    sourceId: string;
    /** Entry-index pointer into card.exchanges[] (D3 unified path). */
    exchangeIndex: number;
  }[]): Promise<GameSyncPayload>
  confirmNextPlayer(): Promise<GameSyncPayload>
  confirmPlayerSwitch(): Promise<GameSyncPayload>
  performRoundEnd(): Promise<GameSyncPayload>
  undoStep(): Promise<GameSyncPayload>
  undoAction(): Promise<GameSyncPayload>
  newGame(seed?: number): Promise<GameSyncPayload>
  loadGame(state: unknown): Promise<GameSyncPayload>
  devSetResources(playerIndex: number, resources: Record<string, number>): Promise<GameSyncPayload>
  devSetRound(round: number): Promise<GameSyncPayload>
  devDrawCard(playerIndex: number, cardId: string): Promise<GameSyncPayload>
  devPlayCard(playerIndex: number, cardId: string): Promise<GameSyncPayload>
  devCreatePasture(playerIndex: number): Promise<GameSyncPayload>
  draftSubmit(playerId: string, pick: DraftPickPayload): Promise<GameSyncPayload>
  parentSubmit(playerIndex: number, selection: ParentSelectionSubmission): Promise<GameSyncPayload>
  validateFarmChoice(type: string, playerId: string, payload: Record<string, unknown>): Promise<ValidateResult>
  onSnapshot(cb: SnapshotListener): () => void
  destroy(): void
}

import { API_BASE, WS_BASE } from '../config'

const post = async (path: string, body?: unknown): Promise<GameSyncPayload> => {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return resp.json() as Promise<GameSyncPayload>
}

const get = async (path: string): Promise<GameSyncPayload> => {
  const resp = await fetch(`${API_BASE}${path}`, { credentials: 'include' })
  return resp.json() as Promise<GameSyncPayload>
}

export class HttpGameTransport implements GameTransport {
  private listeners = new Set<SnapshotListener>()
  private inflight = false

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inflight) throw new Error('request already in flight')
    this.inflight = true
    try { return await fn() } finally { this.inflight = false }
  }

  private emit(payload: GameSyncPayload) {
    this.listeners.forEach((cb) => cb(payload))
  }

  private async send(fn: () => Promise<GameSyncPayload>): Promise<GameSyncPayload> {
    const payload = await this.guard(fn)
    this.emit(payload)
    return payload
  }

  async getState(_options?: GetStateOptions): Promise<GameSyncPayload> {
    const payload = await get('/api/game/state')
    this.emit(payload)
    return payload
  }

  takeAction(playerIndex: number, spaceId: string) {
    return this.send(() => post('/api/game/action', { playerIndex, spaceId }))
  }

  takeSpecialAction(
    playerIndex: number,
    cardId: string,
    actionId: MoorSpecialActionId,
    payload?: MoorSpecialActionPayload,
  ) {
    return this.send(() => post('/api/game/special-action', { playerIndex, cardId, actionId, payload }))
  }

  resolveChoice(playerIndex: number, value: string, payload?: Record<string, unknown>) {
    return this.send(() => post('/api/game/choice', { playerIndex, value, payload }))
  }

  takeAnytimeAction(playerIndex: number, actionId: string) {
    return this.send(() => post('/api/game/anytime', { playerIndex, actionId }))
  }

  ordinaryDrawKeep(playerIndex: number, choiceId: string, keepCardId: string) {
    return this.send(() => post('/api/game/ordinary-draw/keep', { playerIndex, choiceId, keepCardId }))
  }

  commitSelection(
    playerIndex: number,
    payload: CommitSelectionPayload,
  ) {
    return this.send(() => post('/api/game/commit-selection', { playerIndex, payload }))
  }

  confirmFeed(playerIndex: number, selections: Parameters<GameTransport['confirmFeed']>[1]) {
    return this.send(() => post('/api/game/feed', { playerIndex, selections }))
  }

  confirmNextPlayer() {
    return this.send(() => post('/api/game/next-player'))
  }

  confirmPlayerSwitch() {
    return this.send(() => post('/api/game/confirm-player-switch'))
  }

  performRoundEnd() {
    return this.send(() => post('/api/game/round-end'))
  }

  undoStep() {
    return this.send(() => post('/api/game/undo'))
  }

  undoAction() {
    return this.send(() => post('/api/game/undo-action'))
  }

  newGame(seed?: number) {
    return this.send(() => post('/api/game/new', seed !== undefined ? { seed } : undefined))
  }

  loadGame(state: unknown) {
    return this.send(() => post('/api/game/load', { state }))
  }

  devSetResources(playerIndex: number, resources: Record<string, number>) {
    return this.send(() => post('/api/game/dev/set-resources', { playerIndex, resources }))
  }

  devSetRound(round: number) {
    return this.send(() => post('/api/game/dev/set-round', { round }))
  }

  devDrawCard(playerIndex: number, cardId: string) {
    return this.send(() => post('/api/game/dev/draw-card', { playerIndex, cardId }))
  }

  devPlayCard(playerIndex: number, cardId: string) {
    return this.send(() => post('/api/game/dev/play-card', { playerIndex, cardId }))
  }

  devCreatePasture(playerIndex: number) {
    return this.send(() => post('/api/game/dev/create-pasture', { playerIndex }))
  }

  draftSubmit(playerId: string, pick: DraftPickPayload) {
    return this.send(() => post('/api/game/draft-submit', { playerId, pick }))
  }

  parentSubmit(playerIndex: number, selection: ParentSelectionSubmission) {
    return this.send(() => post('/api/game/parent-submit', { playerIndex, selection }))
  }

  async validateFarmChoice(type: string, playerId: string, payload: Record<string, unknown>): Promise<ValidateResult> {
    const resp = await fetch(`${API_BASE}/api/game/validate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, playerId, payload }),
    })
    return resp.json() as Promise<ValidateResult>
  }

  onSnapshot(cb: SnapshotListener): () => void {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  destroy() {
    this.listeners.clear()
  }
}

const commandUuid = (): string => {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID()
  // getRandomValues also works on the explicitly supported HTTP LAN launcher.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// WS_BASE imported from config

export type RoomConnectionStatus =
  | { phase: 'connecting' | 'connected' | 'reconnecting' | 'recovering' | 'ready' }
  | { phase: 'stopped'; message: string; code?: string }
export type RoomConnectionOptions = {
  route?: false | ((roomId: string, pending: ClientCommand[]) => Promise<string>)
  reconnectDelayMs?: number
}
type ReceiptEvent = Extract<ServerEvent, { type: 'commandReceipt' }>
type PendingEvent = { match: (event: ServerEvent) => boolean; resolve: (event: ServerEvent) => void; reject: (error: Error) => void }
const readOnlyCommand = (command: ClientCommand): boolean =>
  ['auth', 'joinRoom', 'getState', 'getHistory', 'getCommandScope', 'getCommandReceipt'].includes(command.type)
const terminalCode = (code?: string): boolean => !!code && [
  'seat_replaced', 'login_required', 'not_participant', 'unknown_context', 'context_changed',
  'context_expired', 'context_removed', 'command_scope_expired',
  'player_slot_required',
].includes(code)

export class WsGameTransport implements GameTransport {
  private ws: WebSocket | null = null
  private listeners = new Set<SnapshotListener>()
  private eventListeners = new Set<(event: ServerEvent) => void>()
  private connectionListeners = new Set<(status: RoomConnectionStatus) => void>()
  private recoveryListeners = new Set<(code: string) => void>()
  private persistenceStatusListeners = new Set<PersistenceStatusListener>()
  private pendingResolvers = new Map<string, {
    resolve: (payload: GameSyncPayload) => void
    reject: (err: Error) => void
    commandId?: string
  }>()
  private pendingHistoryResolvers = new Map<string, { resolve: (page: RoomHistoryPage) => void; reject: (error: Error) => void }>()
  private eventWaiters = new Set<PendingEvent>()
  private commandScope?: CommandScope
  private committedVersion = 0
  private inputWindow?: InputWindow
  private latestPayload?: GameSyncPayload
  private readonly journal: RoomCommandJournal
  private readonly completed = new Map<string, CommandOutcome>()
  private readonly options: RoomConnectionOptions
  private readonly wsUrl: string
  private seatHint?: number
  roomId: string
  playerIndex: number
  private _connected = false
  private persistencePaused = false
  private recovering = false
  private stopped = false
  private hasConnected = false
  private retryTimer?: ReturnType<typeof setTimeout>
  private retryAttempt = 0
  private allocationId = commandUuid()
  private generation = 0
  private status: RoomConnectionStatus = { phase: 'connecting' }

  constructor(wsUrl: string = WS_BASE, roomId?: string, playerIndex?: number, options: RoomConnectionOptions = {}) {
    this.options = options
    this.wsUrl = wsUrl
    this.journal = new RoomCommandJournal(`agricola.pending-commands:${wsUrl}`, roomId ?? '')
    this.roomId = this.journal.roomId
    this.seatHint = playerIndex ?? this.journal.playerIndex
    this.playerIndex = this.seatHint ?? 0
  }

  get connected() { return this._connected && !this.recovering && !this.stopped }
  get recoveringCommands() { return this.recovering || this.journal.commands.size > 0 }

  private connectStarted: number | undefined

  async connect(): Promise<void> {
    this.connectStarted = performance.now()
    this.stopped = false
    this.recovering = this.journal.commands.size > 0
    await this.openSocket()
    if (this.recovering) await this.restore()
    else this.setStatus({ phase: 'connected' })
  }

  private async openSocket(): Promise<void> {
    const generation = ++this.generation
    const url = await this.resolveRoute()
    if (this.stopped || generation !== this.generation) throw new Error('Connection superseded')
    const previous = this.ws
    this.ws = null
    previous?.close()
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url)
      this.ws = socket
      const scope = this.readScope()
      let authenticated = false
      let requestedFreshScope = false
      const timer = setTimeout(() => { observeBrowser('connect_ready', this.connectStarted ?? performance.now(), undefined, 'timeout'); reject(new Error('Connection timed out')); socket.close() }, 10000)
      socket.onopen = () => {
        if (this.ws !== socket) return
        socket.send(JSON.stringify({ type: 'getCommandScope', ...(scope ? { scopeId: scope.scopeId } : {}) }))
      }
      socket.onerror = () => { if (this.ws === socket) reject(new Error('WebSocket connection failed')) }
      socket.onclose = (event) => {
        clearTimeout(timer)
        if (this.ws !== socket) return
        this._connected = false
        const error = new Error('WebSocket disconnected')
        reject(error)
        this.rejectReads(error)
        this.eventWaiters.forEach(waiter => waiter.reject(error))
        if (event?.code === 4001 || event?.code === 1008) {
          this.stop(event.reason || 'Connection access ended', event.code === 4001 ? 'seat_replaced' : 'login_required')
        } else if (this.hasConnected && !this.stopped) this.scheduleReconnect()
      }
      socket.onmessage = (event) => {
        if (this.ws !== socket || this.stopped) return
        let msg: ServerEvent
        try { msg = JSON.parse(event.data as string) as ServerEvent } catch { return }
        if (msg.type === 'commandScope') {
          clearTimeout(timer)
          authenticated = true
          this.commandScope = msg.scope
          try { sessionStorage.setItem(this.scopeKey(), JSON.stringify(msg.scope)) } catch { /* storage disabled */ }
          this.hasConnected = true
          this._connected = true
          resolve()
          return
        }
        if (msg.type === 'authOk') return
        if (msg.type === 'error' && !authenticated) {
          // A different login can replace an idle tab scope. Pending identities
          // must still fail closed instead of becoming new operations.
          if (msg.code === 'command_scope_expired' && !this.journal.commands.size && !requestedFreshScope) {
            requestedFreshScope = true
            socket.send(JSON.stringify({ type: 'getCommandScope' }))
            return
          }
          clearTimeout(timer)
          this.stop(msg.error, msg.code ?? 'login_required')
          reject(new Error(msg.error))
          return
        }
        this.receive(msg)
      }
    })
  }

  private async resolveRoute(): Promise<string> {
    const pending = [...this.journal.commands.values()]
    if (this.options.route === false) return this.wsUrl
    if (this.options.route) return this.options.route(this.roomId, pending)
    const operation = pending.find(command => command.type === 'createRoom' || command.type === 'newGame') ?? pending[0]
    const identity = operation?.commandContext
    this.allocationId = identity?.allocationId ?? this.allocationId
    const base = new URL(this.wsUrl)
    base.protocol = base.protocol === 'wss:' ? 'https:' : 'http:'
    const response = await fetch(new URL('/api/rooms/locate', base), {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(this.roomId ? { roomId: this.roomId } : { allocationId: this.allocationId }),
        ...(identity ? { pendingIdentity: { scopeId: identity.scopeId, commandId: identity.commandId } } : {}) }),
    })
    if (!response.ok) {
      const error = await response.json() as { error?: string; code?: string }
      throw Object.assign(new Error(error.error ?? 'Room discovery unavailable'), { code: error.code })
    }
    const route = await response.json() as RoomDiscoveryResponse
    if (!/^\/nodes\/[A-Za-z0-9-]+\/ws$/.test(route.wsPath)) throw new Error('Invalid room route')
    const destination = new URL(route.wsPath, this.wsUrl)
    return destination.href
  }

  private scheduleReconnect(): void {
    if (this.retryTimer || this.stopped) return
    this.recovering = true
    this.connectStarted = performance.now()
    observeBrowser('connect_ready', this.connectStarted, undefined, 'reconnect')
    this.setStatus({ phase: 'reconnecting' })
    const delay = this.options.reconnectDelayMs ?? Math.min(10000, 500 * 2 ** Math.min(this.retryAttempt++, 5))
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void (async () => {
        try {
          await this.openSocket()
          await this.restore()
          this.retryAttempt = 0
        } catch (error) {
          if (terminalCode((error as { code?: string }).code)) this.stop(String(error), (error as { code?: string }).code)
          else if (!this.stopped) this.scheduleReconnect()
        }
      })()
    }, delay)
  }

  private async restore(): Promise<void> {
    this.setStatus({ phase: 'recovering' })
    const originalRoom = this.roomId
    // Resolve identities before checking the old Room: a completed newGame may
    // already have retired it, and creation may not have returned a room id.
    for (const command of [...this.journal.commands.values()]) {
      const identity = command.commandContext!
      const requestId = commandUuid()
      const waiting = this.waitEvent(event => event.type === 'commandReceipt' && event.requestId === requestId)
      this.sendRaw({ type: 'getCommandReceipt', identity: { scopeId: identity.scopeId, commandId: identity.commandId }, requestId })
      const result = await waiting as ReceiptEvent
      if (result.status === 'completed') {
        this.completed.set(identity.commandId, result.receipt.outcome)
        if (result.receipt.outcome.ok && result.receipt.outcome.roomId && ['createRoom', 'newGame'].includes(command.type)) this.setRoom(result.receipt.outcome.roomId)
      }
    }
    if (this.roomId !== originalRoom && this.options.route !== false) {
      const url = await this.resolveRoute()
      if (url !== this.ws?.url) await this.openSocket()
    }
    if (this.roomId) {
      // Register before join: roomJoined and the full snapshot can be delivered
      // in the same event-loop turn. A playing Room never becomes ready on ack alone.
      const ready = this.waitEvent(event => event.type === 'stateUpdate' && event.roomId === this.roomId && event.sync === 'snapshot'
        || event.type === 'roomJoined' && event.roomId === this.roomId && event.status === 'waiting')
      this.sendRaw({ type: 'joinRoom', roomId: this.roomId, intent: 'resume', requestedPlayerIndex: this.seatHint })
      await ready
    }
    for (const command of [...this.journal.commands.values()]) {
      const identity = command.commandContext!
      const outcome = this.completed.get(identity.commandId)
      if (outcome) { this.finishCommand(identity.commandId, outcome); continue }
      const simultaneous = command.type === 'draftSubmit' ? 'draft' : command.type === 'parentSubmit' ? 'parent' : null
      const valid = command.type === 'createRoom' && !this.roomId || identity.roomId === this.roomId &&
        (simultaneous ? this.inputWindow?.kind === simultaneous && identity.inputWindowId === this.inputWindow.id : identity.expectedVersion === this.committedVersion)
      if (!valid) {
        this.finishCommand(identity.commandId, { ok: false, code: 'command_input_stale', error: 'The input changed; choose again' })
        this.recoveryListeners.forEach(listener => listener('command_input_stale'))
        continue
      }
      const requestId = commandUuid()
      for (const [oldId, pending] of this.pendingResolvers) {
        if (pending.commandId === identity.commandId) { this.pendingResolvers.delete(oldId); this.pendingResolvers.set(requestId, pending); break }
      }
      this.sendRaw({ ...command, requestId })
    }
    this.recovering = false
    this.setStatus({ phase: this.roomId ? 'ready' : 'connected' })
  }

  private receive(msg: ServerEvent): void {
    if (msg.type === 'stateUpdate') {
      responseReceived(msg.requestId, msg.payload.state, msg.payload.ok ? 'ok' : 'rejected'); snapshotReceived(msg.payload.state)
      if (this.connectStarted !== undefined) { observeBrowser('connect_ready', this.connectStarted, msg.payload.state); this.connectStarted = undefined }
    }
    if (msg.type === 'error') responseReceived(msg.requestId, undefined, msg.code === 'command_input_stale' ? 'stale' : 'error')
    if (msg.type === 'commandReceipt' && msg.status === 'completed') responseReceived(msg.requestId, undefined, msg.receipt.outcome.ok ? 'ok' : 'rejected')
    if (msg.type === 'seat_replaced') this.stop('seat was replaced', 'seat_replaced')
    if (msg.type === 'roomDissolved') this.stop(msg.reason === 'card_takedown' ? 'roomTerminatedCardTakedown' : 'roomDissolved')
    if (msg.type === 'error' && terminalCode(msg.code)) this.stop(msg.error, msg.code)
    if (msg.type === 'commandReceipt' && msg.status === 'completed') {
      this.completed.set(msg.receipt.commandId, msg.receipt.outcome)
      if (!this.recovering) this.finishCommand(msg.receipt.commandId, msg.receipt.outcome)
    } else if (msg.type === 'roomCreated' || msg.type === 'roomJoined' || msg.type === 'roomWaiting') {
      if ('playerIndex' in msg) {
        this.playerIndex = msg.playerIndex
        this.seatHint = msg.playerIndex
        this.journal.playerIndex = msg.playerIndex
      }
      this.setRoom(msg.roomId)
    } else if (msg.type === 'historyPage') {
      if (msg.requestId) { this.pendingHistoryResolvers.get(msg.requestId)?.resolve(msg.page); this.pendingHistoryResolvers.delete(msg.requestId) }
    } else if (msg.type === 'stateUpdate') {
      if (this.roomId === msg.roomId && msg.version < this.committedVersion) {
        if (msg.requestId && this.latestPayload) {
          this.pendingResolvers.get(msg.requestId)?.resolve({ ...this.latestPayload, ok: msg.payload.ok, error: msg.payload.error })
          this.pendingResolvers.delete(msg.requestId)
        }
        return
      }
      this.setRoom(msg.roomId)
      this.committedVersion = msg.version
      this.inputWindow = msg.inputWindow
      this.latestPayload = msg.payload
      this.listeners.forEach(listener => listener(msg.payload, msg.roomId))
      if (msg.requestId) { this.pendingResolvers.get(msg.requestId)?.resolve(msg.payload); this.pendingResolvers.delete(msg.requestId) }
      for (const [commandId, outcome] of this.completed) this.finishCommand(commandId, outcome)
    } else if (msg.type === 'roomPersistencePaused' || msg.type === 'roomPersistenceResumed') {
      this.persistencePaused = msg.type === 'roomPersistencePaused'
      this.persistenceStatusListeners.forEach(listener => listener(this.persistencePaused))
    } else if (msg.type === 'error') {
      const error = Object.assign(new Error(msg.error), { code: msg.code })
      if (msg.requestId) {
        this.pendingHistoryResolvers.get(msg.requestId)?.reject(error); this.pendingHistoryResolvers.delete(msg.requestId)
        this.pendingResolvers.get(msg.requestId)?.reject(error); this.pendingResolvers.delete(msg.requestId)
      }
      // Only recovery's serial protocol uses these waiters; ordinary request
      // errors never reject another command's independently correlated promise.
      this.eventWaiters.forEach(waiter => waiter.reject(error))
    }
    this.eventListeners.forEach(listener => listener(msg))
    for (const waiter of this.eventWaiters) if (waiter.match(msg)) waiter.resolve(msg)
  }

  private finishCommand(commandId: string, outcome: CommandOutcome): void {
    const command = this.journal.commands.get(commandId)
    if (this.recovering && !outcome.ok && command?.type === 'createRoom') {
      this.eventListeners.forEach(listener => listener({ type: 'error', error: outcome.error ?? 'Room creation failed' }))
    }
    let waitingForSnapshot = false
    for (const [requestId, pending] of this.pendingResolvers) {
      if (pending.commandId !== commandId) continue
      if (!outcome.ok) pending.reject(Object.assign(new Error(outcome.error ?? 'Command rejected'), { code: outcome.code }))
      else if (this.latestPayload && (!outcome.roomId || outcome.roomId === this.roomId) && this.committedVersion >= (outcome.roomVersion ?? 0)) pending.resolve({ ...this.latestPayload, ok: outcome.ok, error: outcome.error })
      else { waitingForSnapshot = true; continue }
      this.pendingResolvers.delete(requestId)
    }
    if (!waitingForSnapshot) {
      this.journal.commands.delete(commandId)
      this.completed.delete(commandId)
      this.journal.save()
    }
  }

  private waitEvent(match: PendingEvent['match']): Promise<ServerEvent> {
    return new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); this.eventWaiters.delete(waiter) }
      const waiter: PendingEvent = { match, resolve: event => { finish(); resolve(event) }, reject: error => { finish(); reject(error) } }
      const timer = setTimeout(() => waiter.reject(new Error('Room recovery timed out')), 10000)
      this.eventWaiters.add(waiter)
    })
  }

  private setRoom(roomId: string): void {
    if (this.roomId !== roomId) { this.committedVersion = 0; this.inputWindow = undefined; this.latestPayload = undefined }
    this.roomId = roomId
    this.journal.roomId = roomId
    this.journal.save()
  }
  private setStatus(status: RoomConnectionStatus): void { this.status = status; this.connectionListeners.forEach(listener => listener(status)) }
  private stop(message: string, code?: string): void {
    if (this.stopped) return
    this.stopped = true
    this._connected = false
    clearTimeout(this.retryTimer); this.retryTimer = undefined
    const error = Object.assign(new Error(message), { code })
    this.rejectPending(error)
    this.eventWaiters.forEach(waiter => waiter.reject(error))
    this.setStatus({ phase: 'stopped', message, code })
  }
  private scopeKey(): string { return `agricola.command-scope:${this.wsUrl}` }
  private readScope(): CommandScope | undefined {
    const pending = [...this.journal.commands.values()][0]?.commandContext
    if (pending) return { scopeId: pending.scopeId, expiresAt: 0 } // Expired identities must be rejected, never silently replaced.
    try {
      const value = JSON.parse(sessionStorage.getItem(this.scopeKey()) ?? 'null') as CommandScope | null
      return value && typeof value.scopeId === 'string' && value.expiresAt > Date.now() ? value : undefined
    } catch { return undefined }
  }
  private identify(cmd: ClientCommand): ClientCommand {
    if (readOnlyCommand(cmd)) return cmd
    if (!this.commandScope) throw new Error('Command scope is unavailable')
    if (this.journal.commands.size >= 32) throw new Error('Too many unconfirmed commands')
    const identified: ClientCommand = { ...cmd, commandContext: {
      scopeId: this.commandScope.scopeId, commandId: commandUuid(),
      ...(cmd.type === 'createRoom' ? { allocationId: this.allocationId } : { roomId: this.roomId, expectedVersion: this.committedVersion, ...(this.inputWindow ? { inputWindowId: this.inputWindow.id } : {}) }),
    } }
    this.journal.commands.set(identified.commandContext!.commandId, identified)
    this.journal.save()
    return identified
  }
  private rejectReads(error: Error): void {
    for (const [id, pending] of this.pendingResolvers) if (!pending.commandId) { pending.reject(error); this.pendingResolvers.delete(id) }
    this.pendingHistoryResolvers.forEach(pending => pending.reject(error)); this.pendingHistoryResolvers.clear()
  }
  private rejectPending(error: Error): void {
    this.pendingResolvers.forEach(pending => pending.reject(error)); this.pendingResolvers.clear()
    this.rejectReads(error)
  }
  private sendRaw(command: ClientCommand): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket not connected')
    if (command.requestId) markRequest(command.requestId)
    this.ws.send(JSON.stringify(command))
  }
  getHistory(cursor?: string): Promise<RoomHistoryPage> {
    return new Promise((resolve, reject) => {
      if (!this.connected) { reject(new Error('WebSocket reconnecting')); return }
      const requestId = commandUuid()
      this.pendingHistoryResolvers.set(requestId, { resolve, reject })
      this.sendRaw({ type: 'getHistory', cursor, requestId })
    })
  }
  private sendCommand(cmd: ClientCommand): Promise<GameSyncPayload> {
    return new Promise((resolve, reject) => {
      if (!this.connected) { reject(new Error('WebSocket reconnecting')); return }
      const command = this.identify(cmd)
      const requestId = commandUuid()
      this.pendingResolvers.set(requestId, { resolve, reject, commandId: command.commandContext?.commandId })
      this.sendRaw({ ...command, requestId })
    })
  }
  onEvent(listener: (event: ServerEvent) => void): () => void { this.eventListeners.add(listener); return () => { this.eventListeners.delete(listener) } }
  onConnectionStatus(listener: (status: RoomConnectionStatus) => void): () => void { this.connectionListeners.add(listener); listener(this.status); return () => { this.connectionListeners.delete(listener) } }
  onRecoveryNotice(listener: (code: string) => void): () => void { this.recoveryListeners.add(listener); return () => { this.recoveryListeners.delete(listener) } }

  async getState(options?: GetStateOptions): Promise<GameSyncPayload> {
    return this.sendCommand({
      type: 'getState',
      ...(options?.unredacted ? { unredacted: true } : {}),
    })
  }

  async takeAction(_playerIndex: number, spaceId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'action', spaceId })
  }

  async takeSpecialAction(
    _playerIndex: number,
    cardId: string,
    actionId: MoorSpecialActionId,
    payload?: MoorSpecialActionPayload,
  ): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'specialAction', cardId, actionId, payload })
  }

  async resolveChoice(
    _playerIndex: number,
    value: string,
    payload?: Record<string, unknown>,
  ): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'choice', value, payload })
  }

  async takeAnytimeAction(_playerIndex: number, actionId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'anytime', actionId })
  }

  async ordinaryDrawKeep(playerIndex: number, choiceId: string, keepCardId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'ordinaryDrawKeep', playerIndex, choiceId, keepCardId })
  }

  async commitSelection(
    playerIndex: number,
    payload: CommitSelectionPayload,
  ): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'commitSelection', playerIndex, payload })
  }

  async confirmFeed(_playerIndex: number, selections: Parameters<GameTransport['confirmFeed']>[1]): Promise<GameSyncPayload> {
    // S2 Task 13.4: route through resolveChoice — engine.ts dispatches on
    // InteractionRequest.kind === 'feed' and pulls payload.selections.
    return this.sendCommand({ type: 'choice', value: 'confirm', payload: { selections } })
  }

  async confirmNextPlayer(): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'choice', value: 'confirm' })
  }

  async confirmPlayerSwitch(): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'choice', value: 'confirm' })
  }

  async performRoundEnd(): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'roundEnd' })
  }

  async undoStep(): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'undoStep' })
  }

  async undoAction(): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'undoAction' })
  }

  async newGame(seed?: number): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'newGame', seed })
  }

  async loadGame(state: unknown): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'loadGame', state })
  }

  async devSetResources(playerIndex: number, resources: Record<string, number>): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'devSetResources', playerIndex, resources })
  }

  async devSetRound(round: number): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'devSetRound', round })
  }

  async devDrawCard(playerIndex: number, cardId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'devDrawCard', playerIndex, cardId })
  }

  async devPlayCard(playerIndex: number, cardId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'devPlayCard', playerIndex, cardId })
  }

  async devCreatePasture(playerIndex: number): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'devCreatePasture', playerIndex })
  }

  async draftSubmit(playerId: string, pick: DraftPickPayload): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'draftSubmit', playerId, pick })
  }

  async parentSubmit(playerIndex: number, selection: ParentSelectionSubmission): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'parentSubmit', playerIndex, selection })
  }

  async validateFarmChoice(type: string, playerId: string, payload: Record<string, unknown>): Promise<ValidateResult> {
    const resp = await fetch(`${API_BASE}/api/game/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, playerId, payload }),
    })
    return resp.json() as Promise<ValidateResult>
  }

  onSnapshot(cb: SnapshotListener): () => void {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  onPersistenceStatus(cb: PersistenceStatusListener): () => void {
    this.persistenceStatusListeners.add(cb)
    cb(this.persistencePaused)
    return () => { this.persistenceStatusListeners.delete(cb) }
  }

  sendRoomCommand(type: 'createRoom', opts: { maxPlayers?: number; name?: string; customCardIds?: string[]; enableCommunityDeck?: boolean; enableParentCards?: boolean; draftParents?: boolean; enableThroughTheSeasons?: boolean; enableFarmersOfTheMoor?: boolean; allowIncompleteFarmersOfTheMoorMinorDeal?: boolean; enableSnakeOpening?: boolean; draftMode?: 'none' | 'simultaneous'; draftPoolSize?: number; hotseat?: boolean }): void
  sendRoomCommand(type: 'joinRoom', opts: {
    roomId: string
    intent?: 'join' | 'resume'
    name?: string
    requestedPlayerIndex?: number
  }): void
  sendRoomCommand(type: 'dissolveRoom', opts?: Record<string, unknown>): void
  sendRoomCommand(type: string, opts?: Record<string, unknown>): void {
    if (!this.connected) throw new Error('WebSocket reconnecting')
    this.sendRaw(this.identify({ type, ...(opts ?? {}) } as ClientCommand))
  }

  destroy() {
    this.stop('Transport destroyed')
    this.generation++
    this.listeners.clear()
    this.eventListeners.clear()
    this.connectionListeners.clear()
    this.recoveryListeners.clear()
    this.persistenceStatusListeners.clear()
    this.persistencePaused = false
    const socket = this.ws
    this.ws = null
    socket?.close()
  }
}
