import type { GameSyncPayload, StateUpdateEnvelope } from '../../shared/protocol/game'
import type { Resource } from '../../shared/game/types'
import type { ClientCommand, ServerEvent } from '../../shared/protocol/ws'

export type ValidateResult = {
  valid: boolean
  error?: unknown
}

export type SnapshotListener = (payload: GameSyncPayload) => void

export interface GameTransport {
  getState(): Promise<GameSyncPayload>
  takeAction(playerIndex: number, spaceId: string): Promise<GameSyncPayload>
  resolveChoice(playerIndex: number, value: string): Promise<GameSyncPayload>
  takeAnytimeAction(playerIndex: number, actionId: string): Promise<GameSyncPayload>
  commitFarm(playerIndex: number, farmType: string, payload: Record<string, unknown>): Promise<GameSyncPayload>
  confirmReorg(playerIndex: number, zones: {
    id: string; zoneType: 'pasture' | 'house' | 'stable'
    animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number
  }[]): Promise<GameSyncPayload>
  confirmFeed(playerIndex: number, selections: {
    resourceKey: keyof Resource; count: number; food: number; sourceName?: string
  }[]): Promise<GameSyncPayload>
  confirmNextPlayer(): Promise<GameSyncPayload>
  confirmPlayerSwitch(): Promise<GameSyncPayload>
  performRoundEnd(): Promise<GameSyncPayload>
  undoStep(): Promise<GameSyncPayload>
  undoAction(): Promise<GameSyncPayload>
  newGame(seed?: number): Promise<GameSyncPayload>
  loadGame(state: unknown): Promise<GameSyncPayload>
  devDrawCard(playerIndex: number, cardId: string): Promise<GameSyncPayload>
  devPlayCard(playerIndex: number, cardId: string): Promise<GameSyncPayload>
  devCreatePasture(playerIndex: number): Promise<GameSyncPayload>
  validateFarmChoice(type: string, playerId: string, payload: Record<string, unknown>): Promise<ValidateResult>
  onSnapshot(cb: SnapshotListener): () => void
  destroy(): void
}

import { API_BASE, WS_BASE } from '../config'

const TOKEN_KEY = 'open-agricola-token'

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

const post = async (path: string, body?: unknown): Promise<GameSyncPayload> => {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  return resp.json() as Promise<GameSyncPayload>
}

const get = async (path: string): Promise<GameSyncPayload> => {
  const resp = await fetch(`${API_BASE}${path}`, { headers: authHeaders() })
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

  async getState(): Promise<GameSyncPayload> {
    const payload = await get('/api/game/state')
    this.emit(payload)
    return payload
  }

  takeAction(playerIndex: number, spaceId: string) {
    return this.send(() => post('/api/game/action', { playerIndex, spaceId }))
  }

  resolveChoice(playerIndex: number, value: string) {
    return this.send(() => post('/api/game/choice', { playerIndex, value }))
  }

  takeAnytimeAction(playerIndex: number, actionId: string) {
    return this.send(() => post('/api/game/anytime', { playerIndex, actionId }))
  }

  commitFarm(playerIndex: number, farmType: string, payload: Record<string, unknown>) {
    return this.send(() => post('/api/game/commit-farm', { playerIndex, farmType, payload }))
  }

  confirmReorg(playerIndex: number, zones: Parameters<GameTransport['confirmReorg']>[1]) {
    return this.send(() => post('/api/game/reorg', { playerIndex, zones }))
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

  devDrawCard(playerIndex: number, cardId: string) {
    return this.send(() => post('/api/game/dev/draw-card', { playerIndex, cardId }))
  }

  devPlayCard(playerIndex: number, cardId: string) {
    return this.send(() => post('/api/game/dev/play-card', { playerIndex, cardId }))
  }

  devCreatePasture(playerIndex: number) {
    return this.send(() => post('/api/game/dev/create-pasture', { playerIndex }))
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

  destroy() {
    this.listeners.clear()
  }
}

// WS_BASE imported from config

export class WsGameTransport implements GameTransport {
  private ws: WebSocket | null = null
  private listeners = new Set<SnapshotListener>()
  private pendingResolvers = new Map<number, {
    resolve: (payload: GameSyncPayload) => void
    reject: (err: Error) => void
  }>()
  private reqCounter = 0
  private readonly wsUrl: string
  private readonly authToken: string | null
  readonly roomId: string
  readonly playerIndex: number
  private _connected = false

  constructor(
    wsUrl: string = WS_BASE,
    roomId?: string,
    playerIndex?: number,
    authToken?: string | null,
  ) {
    this.wsUrl = wsUrl
    this.roomId = roomId ?? ''
    this.playerIndex = playerIndex ?? 0
    // If not explicitly provided, read from localStorage
    this.authToken = authToken !== undefined
      ? authToken
      : (typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null)
  }

  get connected() { return this._connected }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl)

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'))
      }
      this.ws.onclose = () => {
        this._connected = false
      }

      this.ws.onopen = () => {
        // Send auth token immediately after opening.
        // If no token, rely on server's ALLOW_ANONYMOUS_WS setting.
        if (this.authToken) {
          this.ws!.send(JSON.stringify({ type: 'auth', token: this.authToken }))
        } else {
          this._connected = true
          resolve()
        }
      }

      this.ws.onmessage = (event) => {
        let msg: ServerEvent
        try { msg = JSON.parse(event.data as string) as ServerEvent } catch { return }

        // Handle authOk: marks connection as fully ready
        if (msg.type === 'authOk') {
          this._connected = true
          resolve()
          return
        }

        // If auth failed before connection was established, reject
        if (msg.type === 'error' && !this._connected) {
          reject(new Error(msg.error))
          return
        }

        if (msg.type === 'stateUpdate') {
          const envelope = msg as StateUpdateEnvelope
          this.listeners.forEach((cb) => cb(envelope.payload))
          this.pendingResolvers.forEach(({ resolve: res }) => {
            res(envelope.payload)
          })
          this.pendingResolvers.clear()
        } else if (msg.type === 'error') {
          this.pendingResolvers.forEach(({ reject: rej }) => {
            rej(new Error(msg.type === 'error' ? msg.error : 'unknown error'))
          })
          this.pendingResolvers.clear()
        }
      }
    })
  }

  private sendCommand(cmd: ClientCommand): Promise<GameSyncPayload> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }
      const id = ++this.reqCounter
      this.pendingResolvers.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(cmd))
    })
  }

  async getState(): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'getState' })
  }

  async takeAction(_playerIndex: number, spaceId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'action', spaceId })
  }

  async resolveChoice(_playerIndex: number, value: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'choice', value })
  }

  async takeAnytimeAction(_playerIndex: number, actionId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'anytime', actionId })
  }

  async commitFarm(playerIndex: number, farmType: string, payload: Record<string, unknown>): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'commitFarm', playerIndex, farmType: farmType as 'fence' | 'room' | 'stable' | 'plow' | 'sow' | 'field-select', payload })
  }

  async confirmReorg(_playerIndex: number, zones: Parameters<GameTransport['confirmReorg']>[1]): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'reorg', zones })
  }

  async confirmFeed(_playerIndex: number, selections: Parameters<GameTransport['confirmFeed']>[1]): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'feed', selections })
  }

  async confirmNextPlayer(): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'nextPlayer' })
  }

  async confirmPlayerSwitch(): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'confirmPlayerSwitch' })
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

  async devDrawCard(playerIndex: number, cardId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'devDrawCard', playerIndex, cardId })
  }

  async devPlayCard(playerIndex: number, cardId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'devPlayCard', playerIndex, cardId })
  }

  async devCreatePasture(playerIndex: number): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'devCreatePasture', playerIndex })
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

  sendRoomCommand(type: 'createRoom', opts: { maxPlayers?: number; name?: string; customCardIds?: string[] }): void
  sendRoomCommand(type: 'joinRoom', opts: { roomId: string; name?: string; requestedPlayerIndex?: number }): void
  sendRoomCommand(type: 'dissolveRoom', opts?: Record<string, unknown>): void
  sendRoomCommand(type: string, opts?: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type, ...(opts ?? {}) }))
  }

  destroy() {
    this.listeners.clear()
    this.pendingResolvers.clear()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._connected = false
  }
}
