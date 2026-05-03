import type { GameSyncPayload, StateUpdateEnvelope } from '../../shared/protocol/game'
import type { ClientCommand, ServerEvent } from '../../shared/protocol/ws'
import type { DraftPickPayload } from '../../shared/draft/types'

export type ValidateResult = {
  valid: boolean
  error?: unknown
}

export type SnapshotListener = (payload: GameSyncPayload) => void

export interface GameTransport {
  getState(): Promise<GameSyncPayload>
  takeAction(playerIndex: number, spaceId: string): Promise<GameSyncPayload>
  resolveChoice(
    playerIndex: number,
    value: string,
    payload?: Record<string, unknown>,
  ): Promise<GameSyncPayload>
  takeAnytimeAction(playerIndex: number, actionId: string): Promise<GameSyncPayload>
  commitFarm(playerIndex: number, farmType: string, payload: Record<string, unknown>): Promise<GameSyncPayload>
  commitSelection(playerIndex: number, payload: {
    positions?: { row: number; col: number }[]
    cardIds?: string[]
  }): Promise<GameSyncPayload>
  confirmReorg(playerIndex: number, zones: {
    id: string; zoneType: 'pasture' | 'house' | 'stable'
    animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number
  }[]): Promise<GameSyncPayload>
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
  validateFarmChoice(type: string, playerId: string, payload: Record<string, unknown>): Promise<ValidateResult>
  onSnapshot(cb: SnapshotListener): () => void
  destroy(): void
}

import { API_BASE, WS_BASE } from '../config'

/**
 * Parse `draftMode` / `draftPoolSize` URL query params into the shape accepted by
 * `sendRoomCommand('createRoom', …)`. Returns `undefined` when draft is disabled
 * (so the payload stays backward compatible with servers that don't know the field).
 *
 * - Unknown/missing `draftMode` → returns `undefined` (classic hand-deal).
 * - `draftMode=simultaneous` without a valid `draftPoolSize` → returns
 *   `{ draftMode: 'simultaneous' }` (server will clamp/apply default).
 * - `draftPoolSize` must be integer in [7, 10]; out-of-range values are dropped.
 */
export function parseDraftParamsFromQuery(
  search: string,
): { draftMode: 'simultaneous'; draftPoolSize?: number } | undefined {
  const params = new URLSearchParams(search)
  if (params.get('draftMode') !== 'simultaneous') return undefined
  const raw = params.get('draftPoolSize')
  const parsed = raw != null ? Number(raw) : NaN
  if (Number.isInteger(parsed) && parsed >= 7 && parsed <= 10) {
    return { draftMode: 'simultaneous', draftPoolSize: parsed }
  }
  return { draftMode: 'simultaneous' }
}

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

  resolveChoice(playerIndex: number, value: string, payload?: Record<string, unknown>) {
    return this.send(() => post('/api/game/choice', { playerIndex, value, payload }))
  }

  takeAnytimeAction(playerIndex: number, actionId: string) {
    return this.send(() => post('/api/game/anytime', { playerIndex, actionId }))
  }

  commitFarm(playerIndex: number, farmType: string, payload: Record<string, unknown>) {
    return this.send(() => post('/api/game/commit-farm', { playerIndex, farmType, payload }))
  }

  commitSelection(
    playerIndex: number,
    payload: { positions?: { row: number; col: number }[]; cardIds?: string[] },
  ) {
    return this.send(() => post('/api/game/commit-selection', { playerIndex, payload }))
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
  private pendingResolvers = new Map<string, {
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
          if (envelope.requestId) {
            const pending = this.pendingResolvers.get(envelope.requestId)
            if (pending) {
              pending.resolve(envelope.payload)
              this.pendingResolvers.delete(envelope.requestId)
            }
          }
        } else if (msg.type === 'error') {
          if (msg.requestId) {
            const pending = this.pendingResolvers.get(msg.requestId)
            if (pending) {
              pending.reject(new Error(msg.error))
              this.pendingResolvers.delete(msg.requestId)
            }
          } else {
            this.pendingResolvers.forEach(({ reject: rej }) => {
              rej(new Error(msg.error))
            })
            this.pendingResolvers.clear()
          }
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
      const requestId = `req-${++this.reqCounter}`
      this.pendingResolvers.set(requestId, { resolve, reject })
      this.ws.send(JSON.stringify({ ...cmd, requestId }))
    })
  }

  async getState(): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'getState' })
  }

  async takeAction(_playerIndex: number, spaceId: string): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'action', spaceId })
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

  async commitFarm(playerIndex: number, farmType: string, payload: Record<string, unknown>): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'commitFarm', playerIndex, farmType: farmType as 'fence' | 'room' | 'stable' | 'sow', payload })
  }

  async commitSelection(
    playerIndex: number,
    payload: { positions?: { row: number; col: number }[]; cardIds?: string[] },
  ): Promise<GameSyncPayload> {
    return this.sendCommand({ type: 'commitSelection', playerIndex, payload })
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

  sendRoomCommand(type: 'createRoom', opts: { maxPlayers?: number; name?: string; customCardIds?: string[]; enableCommunityDeck?: boolean; draftMode?: 'none' | 'simultaneous'; draftPoolSize?: number }): void
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
