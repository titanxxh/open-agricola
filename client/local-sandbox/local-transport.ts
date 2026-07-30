/**
 * LocalGameTransport — `GameTransport` implementation backed by the
 * local-sandbox engine worker. The whole game (engine + custom card code)
 * runs in the author's browser; no server round-trips.
 *
 * Timeout recovery: if the worker does not answer within `timeoutMs`
 * (runaway card code), it is terminated and rebuilt from the last good
 * `persist` snapshot — the game rolls back to the previous step instead of
 * freezing the tab or losing the session.
 */
import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { DraftPickPayload } from '../../shared/draft/types'
import type { ParentSelectionSubmission } from '../../shared/contract/types'
import type { MoorSpecialActionId } from '../../shared/moor/types'
import type { GameTransport, SnapshotListener, ValidateResult } from '../services/gameTransport.ts'
import type {
  LocalGameConfig,
  LocalSandboxRequest,
  LocalSandboxResponse,
  PersistedLocalGame,
  ViewerSpec,
} from './protocol.ts'
import type { FarmChoiceType } from '../../shared/session/farm-choice-validation.ts'

export type WorkerLike = {
  postMessage(message: LocalSandboxRequest): void
  terminate(): void
  onmessage: ((event: { data: LocalSandboxResponse }) => void) | null
  onerror?: ((event: unknown) => void) | null
}

export type LocalTransportOptions = {
  /** Injected in tests; defaults to spawning the real module worker. */
  workerFactory?: () => WorkerLike
  /** Per-request deadline before the worker is considered stuck. */
  timeoutMs?: number
  viewer?: ViewerSpec
  /** Called with every fresh persist snapshot — IndexedDB hook (T4). */
  onPersist?: (persisted: PersistedLocalGame) => void
  /** Called after a successful timeout recovery so the UI can explain the rollback. */
  onRecovered?: (info: { error: string }) => void
}

const DEFAULT_TIMEOUT_MS = 10_000

const defaultWorkerFactory = (): WorkerLike =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike

type PendingEntry = {
  resolve: (response: LocalSandboxResponse & { ok: true }) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class LocalGameTransport implements GameTransport {
  private worker: WorkerLike | null = null
  private readyResolvers: (() => void)[] = []
  private isReady = false
  private pending = new Map<number, PendingEntry>()
  private reqCounter = 0
  private lastPersist: PersistedLocalGame | null = null
  private listeners = new Set<SnapshotListener>()
  private viewer: ViewerSpec
  private recovering = false
  private destroyed = false
  private inflight = false

  private readonly config: LocalGameConfig
  private readonly opts: LocalTransportOptions

  constructor(config: LocalGameConfig, opts: LocalTransportOptions = {}) {
    this.config = config
    this.opts = opts
    this.viewer = opts.viewer ?? { viewerPlayerId: null, mode: 'viewer' }
  }

  /** Spawn the worker and start a fresh game. */
  async start(): Promise<GameSyncPayload> {
    await this.spawn()
    const response = await this.request({ kind: 'init', config: this.config, viewer: this.viewer })
    return this.accept(response)
  }

  /** Spawn the worker and resume a persisted game (IndexedDB resume, T4). */
  async startFromPersisted(persisted: PersistedLocalGame): Promise<GameSyncPayload> {
    await this.spawn()
    const response = await this.request({ kind: 'restore', persisted, viewer: this.viewer })
    return this.accept(response)
  }

  setViewer(viewer: ViewerSpec): void {
    this.viewer = viewer
  }

  getState() { return this.call('getState', [], false) }
  takeAction(playerIndex: number, spaceId: string) { return this.call('takeAction', [playerIndex, spaceId]) }
  takeSpecialAction(
    playerIndex: number,
    cardId: string,
    actionId: MoorSpecialActionId,
    payload?: { tile?: { row: number; col: number } },
  ) { return this.call('takeSpecialAction', [playerIndex, cardId, actionId, payload]) }
  resolveChoice(playerIndex: number, value: string, payload?: Record<string, unknown>) {
    return this.call('resolveChoice', [playerIndex, value, payload])
  }
  takeAnytimeAction(playerIndex: number, actionId: string) { return this.call('takeAnytimeAction', [playerIndex, actionId]) }
  ordinaryDrawKeep(playerIndex: number, choiceId: string, keepCardId: string) {
    return this.call('ordinaryDrawKeep', [playerIndex, choiceId, keepCardId])
  }
  commitSelection(playerIndex: number, payload: Parameters<GameTransport['commitSelection']>[1]) {
    return this.call('commitSelection', [playerIndex, payload])
  }
  confirmFeed(playerIndex: number, selections: Parameters<GameTransport['confirmFeed']>[1]) {
    return this.call('confirmFeed', [playerIndex, selections])
  }
  confirmNextPlayer() { return this.call('confirmNextPlayer', []) }
  confirmPlayerSwitch() { return this.call('confirmPlayerSwitch', []) }
  performRoundEnd() { return this.call('performRoundEnd', []) }
  undoStep() { return this.call('undoStep', []) }
  undoAction() { return this.call('undoAction', []) }
  newGame(seed?: number) { return this.call('newGame', [seed]) }
  loadGame(state: unknown) { return this.call('loadGame', [state]) }
  devSetResources(playerIndex: number, resources: Record<string, number>) {
    return this.call('devSetResources', [playerIndex, resources])
  }
  devSetRound(round: number) { return this.call('devSetRound', [round]) }
  devDrawCard(playerIndex: number, cardId: string) { return this.call('devDrawCard', [playerIndex, cardId]) }
  devPlayCard(playerIndex: number, cardId: string) { return this.call('devPlayCard', [playerIndex, cardId]) }
  devCreatePasture(playerIndex: number) { return this.call('devCreatePasture', [playerIndex]) }
  draftSubmit(playerId: string, pick: DraftPickPayload) { return this.call('draftSubmit', [playerId, pick]) }
  parentSubmit(playerIndex: number, selection: ParentSelectionSubmission) {
    return this.call('parentSubmit', [playerIndex, selection])
  }

  async validateFarmChoice(type: string, playerId: string, payload: Record<string, unknown>): Promise<ValidateResult> {
    const response = await this.request({
      kind: 'call',
      method: 'validateFarmChoice',
      args: [type as FarmChoiceType, playerId, payload],
      viewer: this.viewer,
    })
    return ('raw' in response ? response.raw : { valid: false, error: 'invalid response' }) as ValidateResult
  }

  onSnapshot(cb: SnapshotListener): () => void {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  destroy(): void {
    this.destroyed = true
    this.rejectAllPending(new Error('transport destroyed'))
    this.listeners.clear()
    this.worker?.terminate()
    this.worker = null
  }

  private async call(method: string, args: unknown[], guard = true): Promise<GameSyncPayload> {
    // Serialize mutating commands (match the HTTP transport's in-flight guard):
    // a double-click must not post two commands that resolve against different
    // states. Reads (getState) pass guard=false and stay concurrent.
    if (guard && this.inflight) {
      return Promise.reject(new Error('request already in flight'))
    }
    if (guard) this.inflight = true
    try {
      const response = await this.request({ kind: 'call', method, args, viewer: this.viewer })
      return this.accept(response)
    } finally {
      if (guard) this.inflight = false
    }
  }

  private accept(response: LocalSandboxResponse & { ok: true }): GameSyncPayload {
    if (!('payload' in response)) {
      throw new Error('local sandbox returned no payload')
    }
    this.lastPersist = response.persist
    this.opts.onPersist?.(response.persist)
    this.emit(response.payload)
    return response.payload
  }

  private emit(payload: GameSyncPayload): void {
    this.listeners.forEach((cb) => cb(payload))
  }

  private spawn(): Promise<void> {
    const factory = this.opts.workerFactory ?? defaultWorkerFactory
    const worker = factory()
    this.worker = worker
    this.isReady = false
    worker.onmessage = (event) => this.handleMessage(event.data)
    return new Promise((resolve, reject) => {
      // Reject on worker error or a startup deadline so a chunk that fails to
      // fetch (or a blocked worker) surfaces instead of hanging on the loading
      // screen forever — the request-level timeout only arms after start().
      const timer = setTimeout(
        () => reject(new Error('local sandbox worker failed to start')),
        this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      )
      const settleReady = () => { clearTimeout(timer); resolve() }
      worker.onerror = (event) => {
        clearTimeout(timer)
        const message = (event as { message?: string })?.message ?? 'local sandbox worker error'
        reject(new Error(message))
      }
      if (this.isReady) { settleReady(); return }
      this.readyResolvers.push(settleReady)
    })
  }

  private handleMessage(message: LocalSandboxResponse): void {
    if (message.kind === 'ready') {
      this.isReady = true
      this.readyResolvers.splice(0).forEach((resolve) => resolve())
      return
    }
    const entry = this.pending.get(message.id)
    if (!entry) return
    this.pending.delete(message.id)
    clearTimeout(entry.timer)
    if (message.ok) {
      entry.resolve(message)
    } else {
      entry.reject(new Error(message.error))
    }
  }

  private request(
    request: Omit<Extract<LocalSandboxRequest, { kind: 'init' }>, 'id'>
      | Omit<Extract<LocalSandboxRequest, { kind: 'restore' }>, 'id'>
      | Omit<Extract<LocalSandboxRequest, { kind: 'call' }>, 'id'>,
  ): Promise<LocalSandboxResponse & { ok: true }> {
    if (this.destroyed) return Promise.reject(new Error('transport destroyed'))
    if (this.recovering) return Promise.reject(new Error('local sandbox is recovering'))
    const worker = this.worker
    if (!worker) return Promise.reject(new Error('transport not started'))

    const id = ++this.reqCounter
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { void this.recoverFromTimeout(id) }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      worker.postMessage({ ...request, id } as LocalSandboxRequest)
    })
  }

  private rejectAllPending(error: Error): void {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer)
      entry.reject(error)
    })
    this.pending.clear()
  }

  /**
   * The worker missed a deadline (runaway card code): kill it, rebuild from
   * the last good persist snapshot, and roll the UI back to that step.
   */
  private async recoverFromTimeout(timedOutId: number): Promise<void> {
    if (this.destroyed || this.recovering) return
    this.recovering = true
    const error = 'local sandbox timed out'
    this.rejectAllPending(new Error(error))
    this.worker?.terminate()
    this.worker = null

    const persisted = this.lastPersist
    if (!persisted) {
      this.recovering = false
      return
    }
    try {
      await this.spawn()
      this.recovering = false
      const response = await this.request({ kind: 'restore', persisted, viewer: this.viewer })
      this.accept(response)
      this.opts.onRecovered?.({ error })
    } catch (restoreError) {
      this.recovering = false
      console.warn('[local-sandbox] recovery failed:', restoreError, 'after request', timedOutId)
    }
  }
}

export type { LocalGameConfig, PersistedLocalGame, ViewerSpec }
