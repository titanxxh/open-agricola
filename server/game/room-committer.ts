import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { CustomCardDef } from '../../shared/contract/protocol/game.ts'
import type { ClientCommand } from '../../shared/contract/protocol/ws.ts'
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
import { toRoomMeta, type Room } from './room.ts'
import {
  SqliteRoomPersistence,
  type ReplayCommit,
  type ReplayHead,
} from './persistence/sqlite-adapter.ts'

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const
export const REPLAY_SCHEMA_VERSION = 1
const REPLAY_ASSET_URL_PATTERN = /^\/replay-assets\/([a-f0-9]{64})$/

class ReplayAssetValidationError extends Error {}

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
  cursorHash: string
  stepNo: number
  roomVersion: number
  checkpointStepNo: number
}

type PrepareRoomReadyResult = Exclude<RoomCommitResult, { kind: 'blocked' }>

type PrepareRoomOptions = {
  missingPrefix: boolean
  onReady?: (result: PrepareRoomReadyResult) => void
}

type PendingCommit = {
  room: Room
  commit: ReplayCommit
  frame: JsonValue
  encoded: EncodedReplayFrame
  retryIndex: number
  error: string
  timer: unknown | null
  onCommitted?: (result: Extract<RoomCommitResult, { kind: 'committed' }>) => void
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
    case 'createRoom':
    case 'joinRoom':
    case 'dissolveRoom':
    case 'getState':
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
  const serialized = room.customSessionExecutor?.serializedStateForPersistence()
    ?? serializeSessionSnapshot(room.session.state, room.session)
  const frame = JSON.parse(JSON.stringify(
    scores === undefined ? serialized.frame : { ...serialized.frame, scores },
  )) as JsonValue
  return { serialized, frame }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const sha256 = (value: Buffer): string =>
  createHash('sha256').update(value).digest('hex')

const archiveReplayAsset = (
  artUrl: string,
  assetRoot: string,
  cardArtRoot: string,
  removedAssetHashes: ReadonlySet<string>,
): string => {
  const archived = REPLAY_ASSET_URL_PATTERN.exec(artUrl)
  if (archived) {
    if (removedAssetHashes.has(archived[1]!)) {
      throw new ReplayAssetValidationError('replay asset has been removed')
    }
    const content = readFileSync(join(assetRoot, archived[1]!))
    if (sha256(content) !== archived[1]) {
      throw new ReplayAssetValidationError('archived custom card art is corrupt')
    }
    return artUrl
  }
  if (!artUrl.startsWith('/card-art/')) {
    throw new ReplayAssetValidationError('unsupported custom card art URL')
  }
  const filename = artUrl.slice('/card-art/'.length)
  if (!filename || basename(filename) !== filename || !/^[A-Za-z0-9._-]+$/.test(filename)) {
    throw new ReplayAssetValidationError('invalid custom card art URL')
  }
  const content = readFileSync(join(cardArtRoot, filename))
  const hash = sha256(content)
  if (removedAssetHashes.has(hash)) {
    throw new ReplayAssetValidationError('replay asset has been removed')
  }
  mkdirSync(assetRoot, { recursive: true })
  const target = join(assetRoot, hash)
  try {
    writeFileSync(target, content, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (sha256(readFileSync(target)) !== hash) {
      throw new ReplayAssetValidationError('replay asset hash conflict')
    }
  }
  return `/replay-assets/${hash}`
}

const archiveCustomCardDefs = (
  definitions: CustomCardDef[],
  assetRoot: string,
  cardArtRoot: string,
  removedAssetHashes: ReadonlySet<string>,
): CustomCardDef[] => definitions.map((definition) => ({
  ...definition,
  ...(definition.artUrl
    ? {
        artUrl: archiveReplayAsset(
          definition.artUrl,
          assetRoot,
          cardArtRoot,
          removedAssetHashes,
        ),
      }
    : {}),
}))

const replayAssetHashes = (customCardsJson: string): string[] => {
  const definitions = JSON.parse(customCardsJson) as unknown
  if (!Array.isArray(definitions)) throw new Error('invalid replay custom card archive')
  return definitions.flatMap((definition) => {
    if (!definition || typeof definition !== 'object') return []
    const artUrl = (definition as { artUrl?: unknown }).artUrl
    if (typeof artUrl !== 'string') return []
    const match = REPLAY_ASSET_URL_PATTERN.exec(artUrl)
    return match ? [match[1]!] : []
  })
}

export class RoomCommitter {
  private readonly persistence: SqliteRoomPersistence
  private readonly enabled: boolean
  private readonly viewerBuildId: string
  private readonly gameBuildId: string
  private readonly viewerBuildExists: (viewerBuildId: string) => boolean
  private readonly assetRoot: string
  private readonly cardArtRoot: string
  private readonly removedAssetHashes: ReadonlySet<string>
  private readonly scheduler: RoomCommitScheduler
  private readonly now: () => number
  private readonly heads = new Map<string, RoomHead>()
  private readonly knownReplayIds = new Set<string>()
  private readonly pending = new Map<string, PendingCommit>()
  private readonly pendingReplayLoads = new Map<string, PendingReplayLoad>()
  private readonly permanentErrors = new Map<string, string>()
  private storageFailed = false

  constructor(deps: {
    persistence: SqliteRoomPersistence
    enabled: boolean
    viewerBuildId: string
    gameBuildId: string
    viewerBuildExists: (viewerBuildId: string) => boolean
    assetRoot?: string
    cardArtRoot?: string
    removedAssetHashes?: ReadonlySet<string>
    scheduler?: RoomCommitScheduler
    now?: () => number
  }) {
    this.persistence = deps.persistence
    this.enabled = deps.enabled
    this.viewerBuildId = deps.viewerBuildId.trim()
    this.gameBuildId = deps.gameBuildId.trim()
    this.viewerBuildExists = deps.viewerBuildExists
    this.assetRoot = deps.assetRoot ?? join(process.cwd(), 'data', 'replay-assets')
    this.cardArtRoot = deps.cardArtRoot ?? join(process.cwd(), 'data', 'card-art')
    this.removedAssetHashes = deps.removedAssetHashes ?? new Set()
    this.scheduler = deps.scheduler ?? defaultScheduler
    this.now = deps.now ?? Date.now
  }

  canCreateRoom(): { ok: true } | { ok: false; error: string } {
    if (this.storageFailed) return { ok: false, error: 'replay storage unavailable' }
    if (!this.enabled) return { ok: true }
    if (!this.viewerBuildId) return { ok: false, error: 'replay viewer build is missing' }
    if (!this.viewerBuildExists(this.viewerBuildId)) {
      return { ok: false, error: 'replay viewer build not found' }
    }
    if (!this.gameBuildId) return { ok: false, error: 'game build id is missing' }
    return { ok: true }
  }

  lockNewRoom(room: Room): void {
    room.replayRecording = this.enabled
    room.replayViewerBuildId = this.enabled ? this.viewerBuildId : undefined
    room.replayGameBuildId = this.enabled ? this.gameBuildId : undefined
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

  retireRoom(roomId: string): void {
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
    this.cleanupReplayAssets()
  }

  prepareRoom(
    room: Room,
    options: PrepareRoomOptions,
  ): RoomCommitResult {
    const blocked = this.blockedError(room.id)
    if (blocked) return { kind: 'blocked', error: blocked }
    let persisted: ReplayHead | null
    try {
      persisted = this.persistence.loadReplayHead(room.id)
    } catch (error) {
      return this.deferReplayLoad(room, options, errorMessage(error))
    }
    try {
      return this.prepareLoadedRoom(room, options, persisted)
    } catch (error) {
      if (error instanceof ReplayAssetValidationError) {
        return this.blockPermanently(
          room.id,
          `unable to archive custom card art: ${errorMessage(error)}`,
        )
      }
      return this.deferReplayLoad(room, options, errorMessage(error))
    }
  }

  private prepareLoadedRoom(
    room: Room,
    options: PrepareRoomOptions,
    persisted: ReplayHead | null,
  ): RoomCommitResult {
    if (!persisted && room.status === 'waiting') return { kind: 'unchanged' }
    if (
      !persisted
      && room.replayRecording === undefined
      && room.session.getCustomCardDefs().length > 0
    ) {
      return { kind: 'unchanged' }
    }
    if (persisted) return this.restoreHead(room, persisted)
    const { serialized, frame } = replayFrame(room)
    const legacyRoom = room.replayRecording === undefined
    const shouldRecord = legacyRoom
      ? this.enabled
      : room.replayRecording
    if (!shouldRecord) return { kind: 'unchanged' }
    const viewerBuildId = legacyRoom
      ? this.viewerBuildId
      : room.replayViewerBuildId?.trim() ?? ''
    const gameBuildId = legacyRoom
      ? this.gameBuildId
      : room.replayGameBuildId?.trim() ?? ''
    if (!viewerBuildId) {
      return this.blockPermanently(room.id, 'replay viewer build is missing')
    }
    if (!this.viewerBuildExists(viewerBuildId)) {
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
    const customCardsJson = canonicalJson(archiveCustomCardDefs(
      room.session.getCustomCardDefs(),
      this.assetRoot,
      this.cardArtRoot,
      this.removedAssetHashes,
    ))
    const commit: ReplayCommit = {
      roomId: room.id,
      serialized,
      meta: toRoomMeta(room),
      header: {
        schemaVersion: REPLAY_SCHEMA_VERSION,
        viewerBuildId,
        gameBuildId,
        missingPrefix: legacyRoom && options.missingPrefix,
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
    return this.persist(room, commit, frame, encoded, options.onReady)
  }

  commit(
    room: Room,
    response: SessionResponse,
    replayIntent: ReplayIntent,
    playerIndex: number,
    onCommitted?: (result: Extract<RoomCommitResult, { kind: 'committed' }>) => void,
  ): RoomCommitResult {
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
    const cursorHash = frameHash(serialized.sessionCursor)
    const stepNo = head.stepNo + 1
    const roomVersion = head.roomVersion + 1
    const encoded = encodeReplayFrame({
      frame,
      previousFrame: head.frame,
      stepNo,
      previousCheckpointStepNo: head.checkpointStepNo,
    })
    if (
      encoded.frameHash === head.frameHash &&
      cursorHash === head.cursorHash &&
      response.durableTransition !== true
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
      meta: toRoomMeta(room),
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
    return this.persist(room, commit, frame, encoded, onCommitted)
  }

  shutdown(): void {
    for (const pending of this.pending.values()) {
      if (pending.timer !== null) this.scheduler.clearTimeout(pending.timer)
    }
    for (const pending of this.pendingReplayLoads.values()) {
      if (pending.timer !== null) this.scheduler.clearTimeout(pending.timer)
    }
    this.pending.clear()
    this.pendingReplayLoads.clear()
    this.heads.clear()
    this.knownReplayIds.clear()
    this.permanentErrors.clear()
    this.storageFailed = false
  }

  private restoreHead(
    room: Room,
    persisted: ReplayHead,
  ): RoomCommitResult {
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
    const serialized = this.persistence.loadReplayFrame(room.id)
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
        cursorHash: frameHash(current.sessionCursor),
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

  private persist(
    room: Room,
    commit: ReplayCommit,
    frame: JsonValue,
    encoded: EncodedReplayFrame,
    onCommitted?: (result: Extract<RoomCommitResult, { kind: 'committed' }>) => void,
  ): RoomCommitResult {
    try {
      const persisted = this.persistence.commitReplay(commit)
      if (persisted.kind === 'conflict') {
        return this.blockPermanently(room.id, persisted.error)
      }
      return this.acceptCommit(room, commit, frame, encoded)
    } catch (error) {
      const message = errorMessage(error)
      const pending: PendingCommit = {
        room,
        commit,
        frame,
        encoded,
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
  ): Extract<RoomCommitResult, { kind: 'committed' }> {
    room.version = commit.step.roomVersion
    this.knownReplayIds.add(room.id)
    if (commit.result) {
      this.heads.delete(room.id)
    } else {
      this.heads.set(room.id, {
        frame,
        frameHash: encoded.frameHash,
        cursorHash: frameHash(commit.serialized.sessionCursor),
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
    const delay = RETRY_DELAYS_MS[Math.min(pending.retryIndex, RETRY_DELAYS_MS.length - 1)]!
    pending.retryIndex += 1
    pending.timer = this.scheduler.setTimeout(() => {
      pending.timer = null
      this.retry(pending)
    }, delay)
  }

  private retry(pending: PendingCommit): void {
    try {
      const persisted = this.persistence.commitReplay(pending.commit)
      if (persisted.kind === 'conflict') {
        this.blockPermanently(pending.room.id, persisted.error)
        return
      }
      this.pending.delete(pending.room.id)
      this.updateStorageFailed()
      const result = this.acceptCommit(
        pending.room,
        pending.commit,
        pending.frame,
        pending.encoded,
      )
      pending.onCommitted?.(result)
      pending.waiters.forEach((waiter) => waiter())
    } catch (error) {
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
    const delay = RETRY_DELAYS_MS[Math.min(pending.retryIndex, RETRY_DELAYS_MS.length - 1)]!
    pending.retryIndex += 1
    pending.timer = this.scheduler.setTimeout(() => {
      pending.timer = null
      this.retryReplayLoad(pending)
    }, delay)
  }

  private retryReplayLoad(pending: PendingReplayLoad): void {
    let result: RoomCommitResult
    try {
      const persisted = this.persistence.loadReplayHead(pending.room.id)
      result = this.prepareLoadedRoom(pending.room, pending.options, persisted)
    } catch (error) {
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
    this.pendingReplayLoads.delete(pending.room.id)
    this.updateStorageFailed()
    if (result.kind === 'blocked') {
      pending.waiters.forEach((waiter) => waiter(result.error))
      return
    }
    pending.options.onReady?.(result)
    pending.waiters.forEach((waiter) => waiter())
  }

  private updateStorageFailed(): void {
    this.storageFailed = this.pending.size > 0 || this.pendingReplayLoads.size > 0
  }

  cleanupReplayAssets(): void {
    try {
      const referenced = this.persistence.referencedReplayAssetHashes()
      for (const pending of this.pending.values()) {
        const customCardsJson = pending.commit.header?.customCardsJson
        if (!customCardsJson) continue
        replayAssetHashes(customCardsJson).forEach((hash) => referenced.add(hash))
      }
      for (const entry of readdirSync(this.assetRoot, { withFileTypes: true })) {
        if (!entry.isFile() || !/^[a-f0-9]{64}$/.test(entry.name)) continue
        if (!referenced.has(entry.name)) unlinkSync(join(this.assetRoot, entry.name))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      console.warn(JSON.stringify({
        event: 'replay_asset_cleanup_failed',
        error: errorMessage(error),
      }))
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
