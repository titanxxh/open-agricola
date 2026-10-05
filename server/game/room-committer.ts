import { ExecutionRevokedError } from './execution-access'
import type { OwnerToken } from './room-directory'
import { RoomOwnershipError } from './room-directory'
import { nextInputWindow } from './command-input'
import type { CommandReceiptWrite } from './command-store'
import { RoomHistoryCorruptionError } from './persistence/room-history-store'
import { ReplayResources, ReplayAssetValidationError } from '../storage/replay-resources'
import type { ClientCommand } from '../../shared/contract/protocol/ws.ts'
import { captureStateWithHistory } from '../../shared/session/history-streams.ts'
import {
  serializeSessionSnapshot,
  type PersistedSessionSnapshot,
} from '../../shared/session/serialization.ts'
import type { SessionResponse } from './authoritative-session.ts'
import {
  canonicalJson,
  encodeReplayFrame,
  frameHash,
  type EncodedReplayFrame,
  type JsonValue,
} from './replay-codec.ts'
import { buildGameResult } from './room-persistence-checkpoint.ts'
import { capturePrivateCursor, privateCursorEquals, type PrivateCursorComparison } from './private-cursor-comparison.ts'
import { toRoomMeta, type Room } from './room.ts'
import {
  PostgresRoomPersistence,
  type ReplayCommit,
  type ReplayHead,
} from './persistence/postgres-adapter.ts'

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const
export const REPLAY_SCHEMA_VERSION = 1

export type ReplayIntent = {
  commandType: string
  intentJson: string
}

export type RoomCommitResult =
  | { kind: 'committed'; roomVersion: number; stepNo: number; frameHash: string }
  | { kind: 'unchanged' }
  | { kind: 'blocked'; error: string }

export type RoomCommitScheduler = {
  setTimeout(callback: () => void, delay: number): unknown
  clearTimeout(handle: unknown): void
}

type RoomHead = {
  frame: JsonValue
  frameHash: string
  privateCursor: PrivateCursorComparison
  stepNo: number
  roomVersion: number
  checkpointStepNo: number
}

type PrepareRoomReadyResult = Exclude<RoomCommitResult, { kind: 'blocked' }>

type PrepareRoomOptions = {
  receipt?: CommandReceiptWrite
  retireRoomId?: string
  retiredOwner?: OwnerToken
  retiredVersion?: number
  missingPrefix: boolean
  onReady?: (result: PrepareRoomReadyResult) => void | Promise<void>
}

type PendingCommit = {
  room: Room
  commit: ReplayCommit
  frame: JsonValue
  encoded: EncodedReplayFrame
  privateCursor: PrivateCursorComparison
  retryIndex: number
  error: string
  timer: unknown | null
  onCommitted?: (result: Extract<RoomCommitResult, { kind: 'committed' }>) => void | Promise<void>
  waiters: Array<(error?: string) => void>
}

type PendingReplayLoad = {
  room: Room
  options: PrepareRoomOptions
  retryIndex: number
  error: string
  timer: unknown | null
  waiters: Array<(error?: string) => void>
}

const defaultScheduler: RoomCommitScheduler = {
  setTimeout(callback, delay) {
    const timer = setTimeout(callback, delay)
    timer.unref()
    return timer
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
}

const intent = (commandType: string, params: JsonValue = {}): ReplayIntent => ({
  commandType,
  intentJson: canonicalJson(params),
})

export const replayIntentFromCommand = (command: ClientCommand): ReplayIntent | null => {
  switch (command.type) {
    case 'auth':
    case 'getCommandScope':
    case 'getCommandReceipt':
    case 'createRoom':
    case 'joinRoom':
    case 'dissolveRoom':
    case 'getState':
    case 'getHistory':
    case 'newGame':
      return null
    case 'action':
      return intent(command.type, { spaceId: command.spaceId })
    case 'specialAction':
      return intent(command.type, {
        actionId: command.actionId,
        cardId: command.cardId,
        ...(command.payload?.tile ? { tile: command.payload.tile } : {}),
      })
    case 'choice':
      return intent(command.type, { value: command.value })
    case 'anytime':
      return intent(command.type, { actionId: command.actionId })
    case 'ordinaryDrawKeep':
      return intent(command.type, {
        choiceId: command.choiceId,
        keepCardId: command.keepCardId,
      })
    case 'roundEnd':
    case 'undoStep':
    case 'undoAction':
    case 'loadGame':
    case 'devCreatePasture':
      return intent(command.type)
    case 'commitSelection':
      return intent(command.type, {
        selectionKeys: Object.keys(command.payload).sort(),
      })
    case 'parentSubmit':
      return intent(command.type, {
        selection: {
          mother: command.selection.mother,
          father: command.selection.father,
        },
      })
    case 'devSetResources':
      return intent(command.type, { resources: command.resources })
    case 'devSetRound':
      return intent(command.type, { round: command.round })
    case 'devDrawCard':
    case 'devPlayCard':
      return intent(command.type, { cardId: command.cardId })
    case 'draftSubmit':
      return intent(command.type, {
        pick: {
          ...(typeof command.pick.occCardId === 'string'
            ? { occCardId: command.pick.occCardId }
            : {}),
          ...(typeof command.pick.minorCardId === 'string'
            ? { minorCardId: command.pick.minorCardId }
            : {}),
        },
      })
  }
}

const replayFrame = (
  room: Room,
  scores?: SessionResponse['scores'],
): {
  serialized: PersistedSessionSnapshot
  frame: JsonValue
} => {
  const workerSnapshot = room.customSessionExecutor?.serializedStateForPersistence()
  const serialized = workerSnapshot ?? serializeSessionSnapshot(room.session.state, room.session)
  // Native serialization transfers a fresh, detached Frame. Worker snapshots
  // remain cached outside the committer and still require an owned body copy.
  const frame = workerSnapshot
    ? captureStateWithHistory(scores === undefined ? serialized.frame : { ...serialized.frame, scores })
    : scores === undefined
      ? serialized.frame
      : { ...serialized.frame, scores: JSON.parse(JSON.stringify(scores)) as SessionResponse['scores'] }
  return { serialized, frame: frame as unknown as JsonValue }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class RoomCommitter {
  private readonly persistence: PostgresRoomPersistence
  private readonly viewerBuildId: string
  private readonly gameBuildId: string
  private readonly viewerBuildExists: (viewerBuildId: string) => boolean | Promise<boolean>
  private readonly resources?: ReplayResources
  private readonly scheduler: RoomCommitScheduler
  private readonly now: () => number
  private readonly heads = new Map<string, RoomHead>()
  private readonly knownReplayIds = new Set<string>()
  private readonly pending = new Map<string, PendingCommit>()
  private readonly pendingReplayLoads = new Map<string, PendingReplayLoad>()
  private readonly permanentErrors = new Map<string, string>()
  private storageFailed = false

  constructor(deps: {
    persistence: PostgresRoomPersistence
    viewerBuildId: string
    gameBuildId: string
    viewerBuildExists: (viewerBuildId: string) => boolean | Promise<boolean>
    resources?: ReplayResources
    scheduler?: RoomCommitScheduler
    now?: () => number
  }) {
    this.persistence = deps.persistence
    this.viewerBuildId = deps.viewerBuildId.trim()
    this.gameBuildId = deps.gameBuildId.trim()
    this.viewerBuildExists = deps.viewerBuildExists
    this.resources = deps.resources
    this.scheduler = deps.scheduler ?? defaultScheduler
    this.now = deps.now ?? Date.now
  }

  async canCreateRoom(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.storageFailed) return { ok: false, error: 'replay storage unavailable' }
    if (!this.viewerBuildId) return { ok: false, error: 'replay viewer build is missing' }
    if (!await this.viewerBuildExists(this.viewerBuildId)) {
      return { ok: false, error: 'replay viewer build not found' }
    }
    if (!this.gameBuildId) return { ok: false, error: 'game build id is missing' }
    return { ok: true }
  }

  lockNewRoom(room: Room): void {
    room.replayRecording = true
    room.replayViewerBuildId = this.viewerBuildId
    room.replayGameBuildId = this.gameBuildId
  }

  hasReplay(roomId: string): boolean {
    return this.knownReplayIds.has(roomId) ||
      this.pending.has(roomId) ||
      this.pendingReplayLoads.has(roomId) ||
      this.permanentErrors.has(roomId)
  }

  isRecording(roomId: string): boolean {
    return this.heads.has(roomId)
  }

  isBlocked(roomId: string): boolean {
    return this.pending.has(roomId) ||
      this.pendingReplayLoads.has(roomId) ||
      this.permanentErrors.has(roomId)
  }

  isRetrying(roomId: string): boolean {
    return this.pending.has(roomId) || this.pendingReplayLoads.has(roomId)
  }

  blockedError(roomId: string): string | undefined {
    return this.permanentErrors.get(roomId) ??
      this.pending.get(roomId)?.error ??
      this.pendingReplayLoads.get(roomId)?.error
  }

  waitUntilReady(roomId: string, callback: (error?: string) => void): boolean {
    const pending = this.pending.get(roomId) ?? this.pendingReplayLoads.get(roomId)
    if (!pending) return false
    pending.waiters.push(callback)
    return true
  }

  async retireRoom(roomId: string): Promise<Awaited<void>> {
    const pending = this.pending.get(roomId)
    const pendingLoad = this.pendingReplayLoads.get(roomId)
    if (pending?.timer !== null && pending?.timer !== undefined) {
      this.scheduler.clearTimeout(pending.timer)
    }
    if (pendingLoad?.timer !== null && pendingLoad?.timer !== undefined) {
      this.scheduler.clearTimeout(pendingLoad.timer)
    }
    pending?.waiters.forEach((waiter) => waiter('room retired'))
    pendingLoad?.waiters.forEach((waiter) => waiter('room retired'))
    this.pending.delete(roomId)
    this.pendingReplayLoads.delete(roomId)
    this.permanentErrors.delete(roomId)
    this.heads.delete(roomId)
    this.knownReplayIds.delete(roomId)
    this.updateStorageFailed()
    await this.resources?.releasePreparation(roomId)
  }

  async prepareRoom(
    room: Room,
    options: PrepareRoomOptions,
  ): Promise<Awaited<RoomCommitResult>> {
    const blocked = this.blockedError(room.id)
    if (blocked) return { kind: 'blocked', error: blocked }
    let persisted: ReplayHead | null
    try {
      persisted = (await this.persistence.loadReplayHead(room.id))
    } catch (error) {
      return this.deferReplayLoad(room, options, errorMessage(error))
    }
    try {
      return (await this.prepareLoadedRoom(room, options, persisted))
    } catch (error) {
      if ((error instanceof RoomOwnershipError || error instanceof ExecutionRevokedError)) return this.blockPermanently(room.id, errorMessage(error))
      if (error instanceof RoomHistoryCorruptionError) return this.blockPermanently(room.id, errorMessage(error))
      if (error instanceof ReplayAssetValidationError) {
        return this.blockPermanently(
          room.id,
          `unable to archive custom card art: ${errorMessage(error)}`,
        )
      }
      return this.deferReplayLoad(room, options, errorMessage(error))
    }
  }

  private async prepareLoadedRoom(
    room: Room,
    options: PrepareRoomOptions,
    persisted: ReplayHead | null,
  ): Promise<Awaited<RoomCommitResult>> {
    if (!persisted && room.status === 'waiting') return { kind: 'unchanged' }
    if (persisted) return (await this.restoreHead(room, persisted))
    if (options.missingPrefix || room.replayRecording !== true) {
      return this.blockPermanently(room.id, 'recorded room replay header is missing')
    }
    const { serialized, frame } = replayFrame(room)
    const viewerBuildId = room.replayViewerBuildId?.trim() ?? ''
    const gameBuildId = room.replayGameBuildId?.trim() ?? ''
    if (!viewerBuildId) {
      return this.blockPermanently(room.id, 'replay viewer build is missing')
    }
    if (!await this.viewerBuildExists(viewerBuildId)) {
      return this.blockPermanently(room.id, 'replay viewer build not found')
    }
    if (!gameBuildId) {
      return this.blockPermanently(room.id, 'game build id is missing')
    }

    const encoded = encodeReplayFrame({
      frame,
      previousFrame: null,
      stepNo: 0,
      previousCheckpointStepNo: 0,
    })
    const createdAt = this.now()
    const definitions = room.session.getCustomCardDefs()
    if (!this.resources && definitions.some(definition => definition.artUrl)) throw new ReplayAssetValidationError('Shared resource store is required')
    const customCardsJson = canonicalJson(this.resources
      ? await this.resources.archiveCards(room.id, definitions)
      : definitions)
    const commit: ReplayCommit = {
      roomId: room.id,
      retireRoomId: options.retireRoomId,
      retiredOwner: options.retiredOwner,
      retiredVersion: options.retiredVersion,
      serialized,
      meta: { ...toRoomMeta(room), inputWindow: nextInputWindow(room.inputWindow, serialized.state, 'initial') },
      ...(options.receipt ? { receipt: { request: { ...options.receipt.request }, outcome: { ...options.receipt.outcome, roomId: room.id, roomVersion: 0, stepNo: 0, frameHash: encoded.frameHash } } } : {}),
      header: {
        schemaVersion: REPLAY_SCHEMA_VERSION,
        viewerBuildId,
        gameBuildId,
        missingPrefix: false,
        customCardsJson,
      },
      step: {
        stepNo: 0,
        roomVersion: 0,
        checkpointStepNo: 0,
        playerIndex: null,
        commandType: 'initial',
        intentJson: '{}',
        payloadKind: encoded.payloadKind,
        payloadGzip: encoded.payloadGzip,
        frameHash: encoded.frameHash,
        createdAt,
      },
    }
    return (await this.persist(room, commit, frame, encoded, options.onReady))
  }

  async commit(
    room: Room,
    response: SessionResponse,
    replayIntent: ReplayIntent,
    playerIndex: number,
    onCommitted?: (result: Extract<RoomCommitResult, { kind: 'committed' }>) => void | Promise<void>,
    receipt?: CommandReceiptWrite,
  ): Promise<Awaited<RoomCommitResult>> {
    const blocked = this.blockedError(room.id)
    if (blocked) return { kind: 'blocked', error: blocked }
    if (!response.ok && response.durableTransition !== true) return { kind: 'unchanged' }
    const head = this.heads.get(room.id)
    if (!head) {
      return { kind: 'blocked', error: `replay is not recording for ${room.id}` }
    }
    const { serialized, frame } = replayFrame(
      room,
      response.state.gameOver ? response.scores ?? [] : undefined,
    )
    const stepNo = head.stepNo + 1
    const roomVersion = head.roomVersion + 1
    const encoded = encodeReplayFrame({
      frame,
      previousFrame: head.frame,
      stepNo,
      previousCheckpointStepNo: head.checkpointStepNo,
    })
    if (
      response.durableTransition !== true &&
      encoded.frameHash === head.frameHash &&
      privateCursorEquals(head.privateCursor, serialized.sessionCursor)
    ) {
      return { kind: 'unchanged' }
    }
    if (response.state.gameOver && room.startedAt === undefined) {
      return this.blockPermanently(room.id, 'game start time is missing')
    }
    const createdAt = this.now()
    const commit: ReplayCommit = {
      roomId: room.id,
      serialized,
      meta: { ...toRoomMeta(room), inputWindow: nextInputWindow(room.inputWindow, serialized.state, replayIntent.commandType) },
      ...(receipt ? { receipt: { request: { ...receipt.request }, outcome: { ...receipt.outcome, roomId: room.id, roomVersion, stepNo, frameHash: encoded.frameHash } } } : {}),
      step: {
        stepNo,
        roomVersion,
        checkpointStepNo: encoded.checkpointStepNo,
        playerIndex,
        commandType: replayIntent.commandType,
        intentJson: replayIntent.intentJson,
        payloadKind: encoded.payloadKind,
        payloadGzip: encoded.payloadGzip,
        frameHash: encoded.frameHash,
        createdAt,
      },
      ...(response.state.gameOver
        ? { result: buildGameResult(room, createdAt) }
        : {}),
    }
    return (await this.persist(room, commit, frame, encoded, onCommitted))
  }

  shutdown(): void {
    this.stopped = true
    for (const pending of this.pending.values()) {
      if (pending.timer !== null) this.scheduler.clearTimeout(pending.timer)
      pending.waiters.forEach(waiter => waiter('server shutdown'))
    }
    for (const pending of this.pendingReplayLoads.values()) {
      if (pending.timer !== null) this.scheduler.clearTimeout(pending.timer)
    }
    for (const pending of this.pendingReplayLoads.values()) pending.waiters.forEach(waiter => waiter('server shutdown'))
    this.pending.clear()
    this.pendingReplayLoads.clear()
    this.heads.clear()
    this.knownReplayIds.clear()
    this.permanentErrors.clear()
    this.storageFailed = false
  }

  private async restoreHead(
    room: Room,
    persisted: ReplayHead,
  ): Promise<Awaited<RoomCommitResult>> {
    this.knownReplayIds.add(room.id)
    if (persisted.schemaVersion !== REPLAY_SCHEMA_VERSION) {
      return this.blockPermanently(
        room.id,
        `unsupported replay schema ${persisted.schemaVersion} for ${room.id}`,
      )
    }
    if (room.snapshotRehydrationFailed) {
      return this.blockPermanently(
        room.id,
        `room snapshot rehydration failed for ${room.id} step ${persisted.latestStepNo}`,
      )
    }
    const serialized = (await this.persistence.loadReplayFrame(room.id))
    if (!serialized) {
      return this.blockPermanently(
        room.id,
        `room snapshot missing for ${room.id} step ${persisted.latestStepNo}`,
      )
    }
    const frame = JSON.parse(JSON.stringify(serialized)) as JsonValue
    const hash = frameHash(frame)
    if (hash !== persisted.frameHash) {
      return this.blockPermanently(
        room.id,
        `replay frame hash mismatch at ${room.id} step ${persisted.latestStepNo}`,
      )
    }
    room.version = persisted.roomVersion
    if (persisted.status === 'completed') {
      this.heads.delete(room.id)
    } else {
      const { serialized: current } = replayFrame(room)
      this.heads.set(room.id, {
        frame,
        frameHash: hash,
        privateCursor: capturePrivateCursor(current.sessionCursor),
        stepNo: persisted.latestStepNo,
        roomVersion: persisted.roomVersion,
        checkpointStepNo: persisted.checkpointStepNo,
      })
    }
    return persisted.status === 'completed'
      ? { kind: 'unchanged' }
      : {
          kind: 'committed',
          roomVersion: persisted.roomVersion,
          stepNo: persisted.latestStepNo,
          frameHash: persisted.frameHash,
        }
  }

  private stopped = false

  private async persist(
    room: Room,
    commit: ReplayCommit,
    frame: JsonValue,
    encoded: EncodedReplayFrame,
    onCommitted?: (result: Extract<RoomCommitResult, { kind: 'committed' }>) => void | Promise<void>,
  ): Promise<Awaited<RoomCommitResult>> {
    const privateCursor = capturePrivateCursor(commit.serialized.sessionCursor)
    try {
      const persisted = (await this.persistence.commitReplay(commit))
      if (persisted.kind === 'conflict') {
        return this.blockPermanently(room.id, persisted.error)
      }
      return this.acceptCommit(room, commit, frame, encoded, privateCursor)
    } catch (error) {
      const message = errorMessage(error)
      if ((error instanceof RoomOwnershipError || error instanceof ExecutionRevokedError)) return this.blockPermanently(room.id, message)
      if (this.stopped) return { kind: 'blocked', error: message }
      const pending: PendingCommit = {
        room,
        commit,
        frame,
        encoded,
        privateCursor,
        retryIndex: 0,
        error: message,
        timer: null,
        onCommitted,
        waiters: [],
      }
      this.pending.set(room.id, pending)
      this.updateStorageFailed()
      console.warn(JSON.stringify({
        event: 'durable_room_commit_failed',
        roomId: room.id,
        stepNo: commit.step.stepNo,
        error: message,
      }))
      this.scheduleRetry(pending)
      return { kind: 'blocked', error: message }
    }
  }

  private acceptCommit(
    room: Room,
    commit: ReplayCommit,
    frame: JsonValue,
    encoded: EncodedReplayFrame,
    privateCursor: PrivateCursorComparison,
  ): Extract<RoomCommitResult, { kind: 'committed' }> {
    room.version = commit.step.roomVersion
    room.inputWindow = commit.meta.inputWindow ?? null
    this.knownReplayIds.add(room.id)
    if (commit.result) {
      this.heads.delete(room.id)
    } else {
      this.heads.set(room.id, {
        frame,
        frameHash: encoded.frameHash,
        privateCursor,
        stepNo: commit.step.stepNo,
        roomVersion: commit.step.roomVersion,
        checkpointStepNo: encoded.checkpointStepNo,
      })
    }
    return {
      kind: 'committed',
      roomVersion: commit.step.roomVersion,
      stepNo: commit.step.stepNo,
      frameHash: encoded.frameHash,
    }
  }

  private scheduleRetry(pending: PendingCommit): void {
    if (this.stopped) return
    const delay = RETRY_DELAYS_MS[Math.min(pending.retryIndex, RETRY_DELAYS_MS.length - 1)]!
    pending.retryIndex += 1
    pending.timer = this.scheduler.setTimeout(async () => {
      pending.timer = null
      ;(await this.retry(pending))
    }, delay)
  }

  private async retry(pending: PendingCommit): Promise<Awaited<void>> {
    if (this.stopped || !this.pending.has(pending.room.id)) return
    try {
      const persisted = (await this.persistence.commitReplay(pending.commit))
      if (this.stopped) return
      if (persisted.kind === 'conflict') {
        this.blockPermanently(pending.room.id, persisted.error)
        return
      }
      const result = this.acceptCommit(
        pending.room,
        pending.commit,
        pending.frame,
        pending.encoded,
        pending.privateCursor,
      )
      const error = await this.publishRecovered(pending.room, () => pending.onCommitted?.(result))
      if (this.pending.get(pending.room.id) !== pending) return
      this.pending.delete(pending.room.id)
      this.updateStorageFailed()
      pending.waiters.splice(0).forEach((waiter) => waiter(error))
    } catch (error) {
      if ((error instanceof RoomOwnershipError || error instanceof ExecutionRevokedError)) { this.blockPermanently(pending.room.id, error.message); return }
      pending.error = errorMessage(error)
      console.warn(JSON.stringify({
        event: 'durable_room_commit_retry_failed',
        roomId: pending.room.id,
        stepNo: pending.commit.step.stepNo,
        error: pending.error,
      }))
      this.scheduleRetry(pending)
    }
  }

  private deferReplayLoad(
    room: Room,
    options: PrepareRoomOptions,
    error: string,
  ): Extract<RoomCommitResult, { kind: 'blocked' }> {
    const pending: PendingReplayLoad = {
      room,
      options,
      retryIndex: 0,
      error,
      timer: null,
      waiters: [],
    }
    this.pendingReplayLoads.set(room.id, pending)
    this.updateStorageFailed()
    console.warn(JSON.stringify({
      event: 'replay_head_load_failed',
      roomId: room.id,
      error,
    }))
    this.scheduleReplayLoadRetry(pending)
    return { kind: 'blocked', error }
  }

  private scheduleReplayLoadRetry(pending: PendingReplayLoad): void {
    if (this.stopped) return
    const delay = RETRY_DELAYS_MS[Math.min(pending.retryIndex, RETRY_DELAYS_MS.length - 1)]!
    pending.retryIndex += 1
    pending.timer = this.scheduler.setTimeout(async () => {
      pending.timer = null
      ;(await this.retryReplayLoad(pending))
    }, delay)
  }

  private async retryReplayLoad(pending: PendingReplayLoad): Promise<Awaited<void>> {
    if (this.stopped || !this.pendingReplayLoads.has(pending.room.id)) return
    let result: RoomCommitResult
    try {
      const persisted = (await this.persistence.loadReplayHead(pending.room.id))
      result = (await this.prepareLoadedRoom(pending.room, pending.options, persisted))
    } catch (error) {
      if (error instanceof RoomOwnershipError || error instanceof ExecutionRevokedError || error instanceof RoomHistoryCorruptionError) {
        this.blockPermanently(pending.room.id, errorMessage(error))
        return
      }
      if (error instanceof ReplayAssetValidationError) {
        this.blockPermanently(
          pending.room.id,
          `unable to archive custom card art: ${errorMessage(error)}`,
        )
        return
      }
      pending.error = errorMessage(error)
      console.warn(JSON.stringify({
        event: 'replay_head_load_retry_failed',
        roomId: pending.room.id,
        error: pending.error,
      }))
      this.scheduleReplayLoadRetry(pending)
      return
    }

    if (!this.pendingReplayLoads.has(pending.room.id)) return
    const pendingCommit = this.pending.get(pending.room.id)
    if (pendingCommit) {
      pendingCommit.waiters.push(...pending.waiters)
      this.pendingReplayLoads.delete(pending.room.id)
      this.updateStorageFailed()
      return
    }
    const error = result.kind === 'blocked'
      ? result.error
      : await this.publishRecovered(pending.room, () => pending.options.onReady?.(result))
    if (this.pendingReplayLoads.get(pending.room.id) !== pending) return
    this.pendingReplayLoads.delete(pending.room.id)
    this.updateStorageFailed()
    pending.waiters.splice(0).forEach((waiter) => waiter(error))
  }

  /** The durable outcome is known. Never replay adoption callbacks after a partial publication. */
  private async publishRecovered(room: Room, publish: () => void | Promise<void>): Promise<string | undefined> {
    try {
      await publish()
      return undefined
    } catch (error) {
      const message = errorMessage(error)
      if (error instanceof RoomOwnershipError || error instanceof ExecutionRevokedError) {
        this.permanentErrors.set(room.id, message)
      }
      console.warn(JSON.stringify({ event: 'durable_room_publication_failed', roomId: room.id, error: message }))
      // Release the command queue even if publication failed; reconnect recovers
      // the committed receipt and snapshot without executing the command twice.
      for (const player of room.players) {
        try { player.ws.close(1012, 'Reload committed room state') } catch { /* Already disconnected. */ }
      }
      return message
    }
  }

  private updateStorageFailed(): void {
    this.storageFailed = this.pending.size > 0 || this.pendingReplayLoads.size > 0
  }

  async cleanupReplayAssets(): Promise<void> {
    try { await this.resources?.collect() } catch (error) {
      console.warn(JSON.stringify({ event: 'replay_asset_cleanup_failed', error: errorMessage(error) }))
    }
  }

  private blockPermanently(roomId: string, error: string): Extract<RoomCommitResult, { kind: 'blocked' }> {
    const pending = this.pending.get(roomId)
    const pendingLoad = this.pendingReplayLoads.get(roomId)
    if (pending?.timer !== null && pending?.timer !== undefined) {
      this.scheduler.clearTimeout(pending.timer)
    }
    if (pendingLoad?.timer !== null && pendingLoad?.timer !== undefined) {
      this.scheduler.clearTimeout(pendingLoad.timer)
    }
    this.pending.delete(roomId)
    this.pendingReplayLoads.delete(roomId)
    this.permanentErrors.set(roomId, error)
    this.updateStorageFailed()
    console.error(JSON.stringify({ event: 'durable_room_commit_blocked', roomId, error }))
    pending?.waiters.forEach((waiter) => waiter(error))
    pendingLoad?.waiters.forEach((waiter) => waiter(error))
    return { kind: 'blocked', error }
  }
}
