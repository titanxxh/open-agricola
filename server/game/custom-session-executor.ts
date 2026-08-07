import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GameState } from '../../shared/contract/types.ts'
import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { InitialStateOptions } from '../../shared/session/state-bootstrap.ts'
import {
  rehydrateState,
  serializeState,
  type SerializedGameState,
} from '../../shared/session/serialization.ts'
import {
  GameSession,
  type SessionResponse,
  type SyncPayloadMode,
} from './authoritative-session.ts'
import type { StateWithCursor } from '../../shared/session/session-core.ts'

const WORKER_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'custom-session-worker-entry.mjs',
)
const COMMAND_TIMEOUT_MS = 10_000
const MAX_CUSTOM_SESSION_WORKER_SLOTS = 15
const activeSessionWorkers = new Set<CustomSessionExecutor>()
const reservedSessionWorkers = new Set<CustomSessionExecutor>()

const claimedSessionWorkers = (): Set<CustomSessionExecutor> =>
  new Set([...activeSessionWorkers, ...reservedSessionWorkers])

export type CustomSessionMethod =
  | 'getState'
  | 'takeAction'
  | 'takeSpecialAction'
  | 'resolveChoice'
  | 'takeAnytimeAction'
  | 'resolveOrdinaryCardDrawChoice'
  | 'commitSelectionChoice'
  | 'submitParentSelection'
  | 'performRoundEnd'
  | 'undoStep'
  | 'undoAction'
  | 'loadState'
  | 'startDevFenceSelect'
  | 'devPlayCard'
  | 'devDrawCard'
  | 'devSetSpaceTaken'
  | 'devSetCurrentPlayer'
  | 'devSetResources'
  | 'devAddRooms'
  | 'devSetRound'
  | 'submitDraftPick'
  | 'getAvailableActions'
  | 'validateFarmChoice'
  | 'confirmCurrentPlayer'
  | 'updatePlayerNames'

type WorkerRequest = {
  id: number
  method: CustomSessionMethod
  args: unknown[]
  init?: {
    serialized: SerializedGameState
    customCards: CustomCardData[]
  }
}

type WorkerPayloads = {
  debug: GameSyncPayload
  spectator: GameSyncPayload
  viewers: Record<string, GameSyncPayload>
}

type WorkerState = {
  response: Omit<SessionResponse, 'state'>
  serialized: SerializedGameState
  payloads: WorkerPayloads
}

type WorkerResponse = {
  id: number
  ok: true
  raw?: unknown
} & WorkerState | {
  id: number
  ok: false
  error: string
} & Partial<WorkerState>

const payloadsByResponse = new WeakMap<SessionResponse, WorkerPayloads>()

export const buildSessionSyncPayload = (
  session: GameSession,
  response: SessionResponse,
  viewerPlayerId: string | null,
  mode: SyncPayloadMode = 'viewer',
): GameSyncPayload => {
  const payloads = payloadsByResponse.get(response)
  if (!payloads) return session.buildSyncPayload(response, viewerPlayerId, mode)
  if (mode === 'debug') return payloads.debug
  return viewerPlayerId ? payloads.viewers[viewerPlayerId] ?? payloads.spectator : payloads.spectator
}

const hasExecutableCards = (customCards: CustomCardData[] | undefined): boolean =>
  customCards?.some((card) => !!card.compiledCode && !!card.codeManifest) ?? false

const withoutExecutableCode = (customCards: CustomCardData[] | undefined): CustomCardData[] | undefined =>
  customCards?.map((card) => card.compiledCode && card.codeManifest
    ? { ...card, effectCode: null, compiledCode: null, codeManifest: null }
    : card)

export class CustomSessionExecutor {
  readonly session: GameSession
  private readonly customCards: CustomCardData[]
  private worker: Worker | null = null
  private workerInitialized = false
  private lastSerialized: SerializedGameState | null = null
  private nextId = 0
  private queue: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(
    session: GameSession,
    customCards: CustomCardData[],
  ) {
    this.session = session
    this.customCards = customCards
  }

  reserveWorkerSlot(replacing?: CustomSessionExecutor): boolean {
    if (this.disposed) return false
    if (reservedSessionWorkers.has(this)) return true
    const claimed = claimedSessionWorkers()
    if (replacing) claimed.delete(replacing)
    if (claimed.size >= MAX_CUSTOM_SESSION_WORKER_SLOTS) return false
    reservedSessionWorkers.add(this)
    return true
  }

  execute(method: CustomSessionMethod, args: unknown[]): Promise<SessionResponse> {
    const result = this.enqueue(async () => {
      try {
        const message = await this.request(method, args)
        if (!message.ok) {
          return message.response && message.serialized && message.payloads
            ? this.applyWorkerState({
                response: message.response,
                serialized: message.serialized,
                payloads: message.payloads,
              })
            : this.failed(message.error)
        }
        return this.applyWorkerState(message)
      } catch (error) {
        return this.failed(error instanceof Error ? error.message : String(error))
      }
    })
    return result
  }

  updatePlayerNames(names: Array<[number, string]>): SessionResponse | Promise<SessionResponse> {
    if (this.workerInitialized) return this.execute('updatePlayerNames', [names])
    for (const [playerIndex, name] of names) this.session.updatePlayerName(playerIndex, name)
    this.lastSerialized = null
    return this.session.withCtx(() => this.session.getState())
  }

  async query<T>(method: 'getAvailableActions' | 'validateFarmChoice', args: unknown[]): Promise<T> {
    return this.enqueue(async () => {
      const message = await this.request(method, args)
      if (!message.ok) {
        if (message.response && message.serialized && message.payloads) {
          this.applyWorkerState({
            response: message.response,
            serialized: message.serialized,
            payloads: message.payloads,
          })
        }
        throw new Error(message.error)
      }
      this.applyWorkerState(message)
      return message.raw as T
    })
  }

  dispose(): void {
    this.disposed = true
    activeSessionWorkers.delete(this)
    reservedSessionWorkers.delete(this)
    void this.worker?.terminate()
    this.worker = null
    this.workerInitialized = false
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  private failed(error: string): SessionResponse {
    const response = this.session.withCtx(() => this.session.getState())
    return { ...response, ok: false, error }
  }

  private applyWorkerState(message: WorkerState): SessionResponse {
    this.lastSerialized = message.serialized
    this.session.withCtx(() => this.session.loadState(rehydrateState(message.serialized)))
    for (const warning of message.payloads.debug.cardWarnings ?? []) {
      if (!this.session.cardWarnings.includes(warning)) this.session.cardWarnings.push(warning)
    }
    const response: SessionResponse = { ...message.response, state: this.session.state }
    payloadsByResponse.set(response, message.payloads)
    return response
  }

  private ensureWorker(): Worker {
    if (this.disposed) throw new Error('custom session executor disposed')
    if (this.worker) return this.worker
    if (
      !reservedSessionWorkers.has(this)
      && claimedSessionWorkers().size >= MAX_CUSTOM_SESSION_WORKER_SLOTS
    ) {
      throw new Error('executable session worker capacity reached')
    }
    const worker = new Worker(WORKER_SCRIPT, {
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 32,
        codeRangeSizeMb: 32,
      },
    })
    worker.unref()
    activeSessionWorkers.add(this)
    this.worker = worker
    this.workerInitialized = false
    worker.once('exit', () => {
      if (this.worker !== worker) return
      this.worker = null
      this.workerInitialized = false
      activeSessionWorkers.delete(this)
    })
    return worker
  }

  private initialSerialized(): SerializedGameState {
    return this.lastSerialized ?? serializeState(this.session.state, {
      engineStack: this.session.getEngineStack(),
    })
  }

  private request(method: CustomSessionMethod, args: unknown[]): Promise<WorkerResponse> {
    const worker = this.ensureWorker()
    const id = ++this.nextId
    const request: WorkerRequest = {
      id,
      method,
      args,
      ...(!this.workerInitialized
        ? {
            init: {
              serialized: this.initialSerialized(),
              customCards: this.customCards,
            },
          }
        : {}),
    }
    this.workerInitialized = true
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer)
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
      }
      const reset = (): void => {
        if (this.worker !== worker) return
        this.worker = null
        this.workerInitialized = false
        activeSessionWorkers.delete(this)
        void worker.terminate()
      }
      const onMessage = (message: WorkerResponse): void => {
        if (message.id !== id) return
        cleanup()
        resolve(message)
      }
      const onError = (error: Error): void => {
        cleanup()
        reset()
        reject(error)
      }
      const onExit = (code: number): void => {
        cleanup()
        reset()
        reject(new Error(`custom session worker exited with code ${code}`))
      }
      const timer = setTimeout(() => {
        cleanup()
        reset()
        reject(new Error('custom session command timed out'))
      }, COMMAND_TIMEOUT_MS)
      worker.on('message', onMessage)
      worker.once('error', onError)
      worker.once('exit', onExit)
      try {
        worker.postMessage(request)
      } catch (error) {
        cleanup()
        reset()
        reject(error)
      }
    })
  }
}

export const createIsolatedGameSession = (
  stateOrSeed?: GameState | number | StateWithCursor,
  customCards?: CustomCardData[],
  initialStateOptions?: InitialStateOptions,
): { session: GameSession; executor?: CustomSessionExecutor } => {
  const executable = hasExecutableCards(customCards)
  const session = new GameSession(
    stateOrSeed,
    executable ? withoutExecutableCode(customCards) : customCards,
    initialStateOptions,
  )
  return executable
    ? { session, executor: new CustomSessionExecutor(session, customCards!) }
    : { session }
}
