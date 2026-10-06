import { measure, measureRule, observeCommand, commandOutcome, roundTag, startObservation, rejectObservedCommand, captureCommandOutcome } from '../observability/metrics'
import { ExecutionAccess, ExecutionRevokedError } from '../game/execution-access'
import { RoomOwnershipError } from '../game/room-directory'
import type { OwnerToken } from '../game/room-directory'
import { CommandError, type CommandRequest } from '../game/command-store'
import { assertCommandInput } from '../game/command-input'
import type { CommandErrorCode } from '../../shared/contract/protocol/commands'
import { withRoomParticipantNames } from './history-presentation'
import { buildRoomHistoryPage, HistoryBranchChangedError } from '../../shared/session/history-window'
import { enqueueRoomCommand, enqueueRoomTask, waitForConnection } from '../game/room-queue.ts'
import { serializeState } from '../../shared/session/serialization'
import { randomUUID } from 'node:crypto'
import type { SessionResponse } from '../game/authoritative-session.ts'
import {
  fixedDevRoomRootId,
  isDevRoom,
  resolveJoinPlayerIndex,
  resolveJoinRequestPlayerIndex,
  roomOccupiedSeatCount,
  type Room,
} from '../game/room.ts'
import { validateSession } from '../auth.ts'
import { getDb } from '../db.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { CustomCodeManifest } from '../../shared/custom-code/types.ts'
import type { ClientCommand } from '../../shared/contract/protocol/ws.ts'
import type { StateUpdateCause } from '../../shared/contract/protocol/game.ts'
import type {
  GameContextErrorCode,
  GameContextLifecycle,
} from '../../shared/contract/protocol/game-context.ts'
import {
  loadLiveDraft,
  type WorkshopDraft,
} from '../workshop-drafts.ts'
import { isLoadableLive } from '../workshop-status.ts'
import type { ConnectionCtx } from './connection-ctx.ts'
import {
  replayIntentFromCommand,
} from '../game/room-committer.ts'
import {
  createIsolatedGameSession,
  type CustomSessionMethod,
} from '../game/custom-session-executor.ts'
import {
  buildInitialStateOptions,
  parseGameSetupRequest,
  resolveCustomCardDbIds,
} from '../game/game-setup-options.ts'

const DRAFT_POOL_SIZE_DEFAULT = 7
const DRAFT_POOL_SIZE_MIN = 7
const DRAFT_POOL_SIZE_MAX = 10
const MAX_ORDINARY_ROOMS = 30
type DraftRoomOptions = { draftMode: 'simultaneous'; draftPoolSize: number }

const workshopDraftToCustomCard = (draft: WorkshopDraft): CustomCardData => ({
  cardType: draft.cardType,
  cardJson: draft.cardJson as unknown as CustomCardData['cardJson'],
  effectCode: draft.effectCode,
  compiledCode: draft.compiledCode,
  codeManifest: draft.codeManifest as CustomCodeManifest | null,
  artUrl: draft.artUrl,
})

export function parseDraftOptions(
  payload: Record<string, unknown>,
): { ok: true; value: DraftRoomOptions | null } | { ok: false; error: string } {
  const rawMode = payload.draftMode
  if (rawMode === undefined || rawMode === null || rawMode === 'none') {
    return { ok: true, value: null }
  }
  if (rawMode !== 'simultaneous') {
    return { ok: false, error: `invalid draftMode: ${String(rawMode)}` }
  }
  let poolSize = DRAFT_POOL_SIZE_DEFAULT
  const rawPool = payload.draftPoolSize
  if (rawPool !== undefined && rawPool !== null) {
    if (
      typeof rawPool !== 'number' ||
      !Number.isFinite(rawPool) ||
      !Number.isInteger(rawPool) ||
      rawPool < DRAFT_POOL_SIZE_MIN ||
      rawPool > DRAFT_POOL_SIZE_MAX
    ) {
      return {
        ok: false,
        error: `invalid draftPoolSize: must be an integer in [${DRAFT_POOL_SIZE_MIN}, ${DRAFT_POOL_SIZE_MAX}]`,
      }
    }
    poolSize = rawPool
  }
  return { ok: true, value: { draftMode: 'simultaneous', draftPoolSize: poolSize } }
}

const loadCustomCards = async (
  cardDbIds: string[],
  requestUserId?: string,
  opts?: { liveOnly?: boolean },
): Promise<Awaited<{ cards: CustomCardData[]; hasNotLive: boolean; loadedDbIds: string[] }>> => {
  if (!cardDbIds.length) return { cards: [], hasNotLive: false, loadedDbIds: [] }
  const db = getDb()
  const result: CustomCardData[] = []
  const loadedDbIds: string[] = []
  let hasNotLive = false
  for (const dbId of cardDbIds) {
    const row = (await db.prepare(
      'SELECT card_type, card_json, code_manifest, art_url, review_status, live, built_in, author_id FROM workshop_cards WHERE id = ?',
    ).get(dbId)) as {
      card_type: string
      card_json: string
      code_manifest: string | null
      art_url: string | null
      review_status: string
      live: number
      built_in: number
      author_id: string
    } | undefined
    if (!row) continue
    // A graduated card taken over by the built-in registry (#642) is no
    // longer injected per-room: it lives in the community deck like any
    // built-in card. Skip it without rejecting the room.
    if (row.review_status === 'merged' && row.built_in === 1) continue
    if (isLoadableLive(row)) {
      try {
        result.push(workshopDraftToCustomCard((await loadLiveDraft(db, dbId))))
        loadedDbIds.push(dbId)
      } catch {
        continue
      }
      continue
    }
    if (opts?.liveOnly) {
      if (requestUserId === row.author_id) hasNotLive = true
      continue
    }
    const allowed = requestUserId === row.author_id
    if (!allowed) continue
    try {
      const parsed = JSON.parse(row.card_json) as Record<string, unknown>
      const effectCode = typeof parsed._code === 'string' ? parsed._code : null
      const compiledCode = typeof parsed._compiled === 'string' ? parsed._compiled : null
      result.push({
        cardType: row.card_type as 'minor' | 'occupation',
        cardJson: parsed as unknown as CustomCardData['cardJson'],
        effectCode,
        compiledCode,
        codeManifest: row.code_manifest ? JSON.parse(row.code_manifest) as CustomCodeManifest : null,
        artUrl: row.art_url ?? null,
      })
      loadedDbIds.push(dbId)
      hasNotLive = true
    } catch { /* skip malformed */ }
  }
  return { cards: result, hasNotLive, loadedDbIds }
}

export const loadCustomCardsFromDb = async (
  cardDbIds: string[],
  requestUserId?: string,
): Promise<Awaited<CustomCardData[]>> => (await loadCustomCards(cardDbIds, requestUserId, { liveOnly: true })).cards

/** Same lookup, but keeps `hasNotLive` so callers can reject unreviewed cards. */
export const loadLiveCustomCards = async (
  cardDbIds: string[],
  requestUserId?: string,
): Promise<Awaited<{ cards: CustomCardData[]; hasNotLive: boolean; loadedDbIds: string[] }>> =>
  (await loadCustomCards(cardDbIds, requestUserId, { liveOnly: true }))

const generateRoomId = async (ctx: ConnectionCtx, devRoomRootId?: string | null): Promise<Awaited<string | null>> => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const generatedId = randomUUID()
    const roomId = devRoomRootId ? `${devRoomRootId}-${generatedId}` : generatedId
    if (!ctx.registry.has(roomId) && !(await ctx.checkpoint.hasRoomId(roomId))) return roomId
  }
  return null
}

const sendCommandError = (
  ctx: ConnectionCtx,
  error: string,
  requestId?: string,
  code?: GameContextErrorCode | CommandErrorCode | 'seat_replaced' | 'history_branch_changed',
  lifecycle?: GameContextLifecycle,
) => {
  rejectObservedCommand(code === 'command_input_stale' ? 'stale' : code === 'login_required' || code === 'seat_replaced' ? 'canceled' : 'rule_rejected')
  if (ctx.activeCommand) {
    ctx.activeCommand.outcome = { ok: false, error, ...(code ? { code } : {}), ...(ctx.currentRoom ? { roomId: ctx.currentRoom.id } : {}) }
    return
  }
  ctx.broadcaster.sendTo(ctx.ws, {
    type: 'error',
    error,
    requestId,
    ...(code ? { code } : {}),
    ...(lifecycle ? { lifecycle } : {}),
  })
}

const requireRoom = (ctx: ConnectionCtx, requestId?: string): Room | null => {
  if (!ctx.currentRoom) { sendCommandError(ctx, 'not in a room', requestId); return null }
  const activeSeat = ctx.currentRoom.players.some((player) =>
    player.ws === ctx.ws && player.playerIndex === ctx.currentPlayerIndex
  )
  if (!activeSeat) {
    sendCommandError(ctx, 'seat was replaced', requestId, 'seat_replaced')
    return null
  }
  return ctx.currentRoom
}

const requireWritableRoom = (ctx: ConnectionCtx, requestId?: string): Room | null => {
  const room = requireRoom(ctx, requestId)
  if (!room) return null
  if (room.status === 'waiting') {
    sendCommandError(ctx, 'game has not started', requestId)
    return null
  }
  if (!ctx.committer || !ctx.committer.hasReplay(room.id)) {
    commandOutcome('blocked')
    sendCommandError(ctx, 'room recording is unavailable', requestId)
    return null
  }
  const blocked = ctx.committer.blockedError(room.id)
  if (!blocked) return room
  commandOutcome('blocked')
  sendCommandError(ctx, `room saving is paused: ${blocked}`, requestId)
  return null
}

const notifyPersistencePaused = async (ctx: ConnectionCtx, room: Room): Promise<void> => {
  await ctx.broadcaster.broadcastEvent(room, {
    type: 'roomPersistencePaused',
    roomId: room.id,
  })
}

const persistResponseReceipt = async (ctx: ConnectionCtx, room: Room, response: SessionResponse): Promise<void> => {
  if (!ctx.activeCommand || !ctx.commands) return
  const outcome = { ok: response.ok, roomId: room.id, roomVersion: room.version, ...(response.error ? { error: response.error } : {}) }
  await ctx.commands.db.transaction(async () => { await ctx.commands!.complete(ctx.activeCommand!.request, outcome) })()
}

const publishCommandResponse = async (
  ctx: ConnectionCtx,
  room: Room,
  response: SessionResponse,
  command: ClientCommand,
  cause: StateUpdateCause,
  /**
   * Seat the command actually ran as. It differs from the connection's own seat
   * in a hotseat room, where every seat is played from seat 0's connection —
   * without it the replay timeline would credit player 1 with everyone's moves.
   */
  seat: number = ctx.currentPlayerIndex,
): Promise<Awaited<void | Promise<void>>> => {
  const finishObservation = captureCommandOutcome()
  if (!response.ok) commandOutcome('rule_rejected')
  if (!response.ok && response.durableTransition !== true) {
    await persistResponseReceipt(ctx, room, response)
    await ctx.broadcaster.sendStateTo(ctx.ws, room, response, command.requestId, cause)
    return
  }
  const { error: _error, ...responseWithoutError } = response
  const publishedResponse: SessionResponse = response.ok
    ? response
    : { ...responseWithoutError, ok: true }
  const requesterResponse = { ws: ctx.ws, response }
  if (response.state.gameOver && room.players.length === 0) {
    room.customSessionExecutor?.dispose()
  }
  const replayIntent = replayIntentFromCommand(command)
  if (!ctx.committer || !ctx.committer.isRecording(room.id) || !replayIntent) {
    throw new Error('Room recording is required before publishing a transition')
  }
  const publishCommitted = async (): Promise<void> => {
    if (response.state.gameOver) ctx.checkpoint.markInactive(room.id)
    await ctx.broadcaster.broadcastCommitted(
      room,
      publishedResponse,
      cause,
      command.requestId,
      requesterResponse,
    )
  }
  const result = (await measure('commit', () => ctx.committer!.commit(
    room,
    publishedResponse,
    replayIntent,
    seat,
    async () => {
      await publishCommitted()
      await ctx.broadcaster.broadcastEvent(room, {
        type: 'roomPersistenceResumed',
        roomId: room.id,
      })
    },
    ctx.activeCommand ? { request: ctx.activeCommand.request, outcome: { ok: response.ok, ...(response.error ? { error: response.error } : {}) } } : undefined,
  )))
  if (result.kind === 'committed') {
    if (response.ok) commandOutcome('committed')
    await publishCommitted()
  } else if (result.kind === 'unchanged') {
    if (response.ok) commandOutcome('unchanged')
    await persistResponseReceipt(ctx, room, response)
    await ctx.broadcaster.sendStateTo(ctx.ws, room, response, command.requestId, cause)
  } else {
    commandOutcome('blocked')
    await notifyPersistencePaused(ctx, room)
    if (!ctx.committer.isRetrying(room.id)) {
      sendCommandError(ctx, result.error, command.requestId)
      return
    }
    return new Promise((resolve) => {
      if (!ctx.committer?.waitUntilReady(room.id, error => { finishObservation(error ? 'blocked' : response.ok ? 'committed' : 'rule_rejected'); resolve() })) {
        finishObservation(ctx.committer?.isBlocked(room.id) || !ctx.committer?.hasReplay(room.id) ? 'blocked' : response.ok ? 'committed' : 'rule_rejected')
        resolve()
      }
    })
  }
}

const publishInitialState = async (
  ctx: ConnectionCtx,
  room: Room,
  response: SessionResponse,
  requestId: string | undefined,
  beforePublish: () => void | Promise<void>,
  onReady: () => void | Promise<void>,
  retireRoomId?: string,
  retiredOwner?: OwnerToken,
  retiredVersion?: number,
): Promise<Awaited<void | Promise<void>>> => {
  const finishObservation = captureCommandOutcome()
  const publishReady = async (): Promise<Awaited<void>> => {
    await beforePublish()
    await ctx.broadcaster.broadcastCommitted(room, response, 'reconnect', requestId)
    await ctx.broadcaster.broadcastEvent(room, {
      type: 'roomPersistenceResumed',
      roomId: room.id,
    })
    await onReady()
    finishObservation('committed')
  }
  if (!ctx.committer) throw new Error('Room recording is required')
  const result = (await ctx.committer.prepareRoom(room, {
    missingPrefix: false,
    retireRoomId,
    retiredOwner,
    retiredVersion,
    ...(ctx.activeCommand ? { receipt: { request: ctx.activeCommand.request, outcome: { ok: true, roomId: room.id, playerIndex: ctx.currentPlayerIndex } } } : {}),
    onReady: publishReady,
  }))
  if (result.kind === 'blocked') {
    commandOutcome('blocked')
    await notifyPersistencePaused(ctx, room)
    if (!ctx.committer.isRetrying(room.id)) {
      sendCommandError(ctx, result.error, requestId)
      return
    }
    return new Promise((resolve) => {
      if (!ctx.committer?.waitUntilReady(room.id, error => { finishObservation(error ? 'blocked' : 'committed'); resolve() })) {
        finishObservation(ctx.committer?.isBlocked(room.id) || !ctx.committer?.hasReplay(room.id) ? 'blocked' : 'committed')
        resolve()
      }
    })
  }
  await beforePublish()
  await ctx.broadcaster.broadcastCommitted(room, response, 'reconnect', requestId)
  await onReady()
  finishObservation(result.kind === 'unchanged' ? 'unchanged' : 'committed')
}

/**
 * In a hotseat room one person holds every seat from a single connection, so a
 * command may name any seat in the room. Every other room keeps the strict
 * one-connection-one-seat rule.
 */
const isHotseatRoom = (ctx: ConnectionCtx): boolean => ctx.currentRoom?.hotseat === true

/**
 * Which seat a game command applies to.
 *
 * Normally that is the seat this connection joined as. A hotseat connection is
 * the whole table, so the command applies to whichever seat the engine is
 * waiting on — the pending interaction's seat when there is one, otherwise the
 * player whose turn it is. The engine still validates the seat, so a stale
 * client cannot act out of turn.
 */
/**
 * Seat for a command that names one. `assertOwnSeat` has already checked it, so
 * a hotseat connection may act as the named seat; every other room ignores the
 * claim and stays on the seat it joined as. Draft and parent selection have no
 * pending interaction to derive a seat from, which is why they name it.
 */
const namedSeat = (ctx: ConnectionCtx, playerIndex: number): number =>
  ctx.currentRoom?.hotseat === true ? playerIndex : ctx.currentPlayerIndex

const actingSeat = (ctx: ConnectionCtx): number => {
  const room = ctx.currentRoom
  if (room?.hotseat !== true) return ctx.currentPlayerIndex
  const { state, interaction } = room.session.getState()
  if (interaction.stateId === 'wait' && typeof interaction.playerIndex === 'number') {
    return interaction.playerIndex
  }
  return state.currentPlayerIndex
}

const assertOwnSeat = (ctx: ConnectionCtx, expectedPlayerIndex: unknown, requestId?: string): boolean => {
  if (typeof expectedPlayerIndex !== 'number') {
    sendCommandError(ctx, 'seat mismatch: you cannot act on another player', requestId)
    return false
  }
  if (isHotseatRoom(ctx)) {
    const seatCount = ctx.currentRoom?.session.state.players.length ?? 0
    if (!Number.isInteger(expectedPlayerIndex) || expectedPlayerIndex < 0 || expectedPlayerIndex >= seatCount) {
      sendCommandError(ctx, 'seat out of range for this game', requestId)
      return false
    }
    return true
  }
  if (expectedPlayerIndex !== ctx.currentPlayerIndex) {
    sendCommandError(ctx, 'seat mismatch: you cannot act on another player', requestId)
    return false
  }
  return true
}

const assertOwnPlayerId = (ctx: ConnectionCtx, expectedPlayerId: unknown, requestId?: string): boolean => {
  if (!ctx.currentRoom) {
    sendCommandError(ctx, 'not in a room', requestId)
    return false
  }
  const state = ctx.currentRoom.session.state
  if (isHotseatRoom(ctx)) {
    if (typeof expectedPlayerId !== 'string' || !state.players.some((player) => player.id === expectedPlayerId)) {
      sendCommandError(ctx, 'seat out of range for this game', requestId)
      return false
    }
    return true
  }
  const ownId = state.players[ctx.currentPlayerIndex]?.id
  if (typeof expectedPlayerId !== 'string' || !ownId || expectedPlayerId !== ownId) {
    sendCommandError(ctx, 'seat mismatch: you cannot act on another player', requestId)
    return false
  }
  return true
}

const assertDevCommandAllowed = (ctx: ConnectionCtx, room: Room, requestId?: string): boolean => {
  if (isDevRoom(room.id)) return true
  sendCommandError(ctx, 'dev commands disabled for this room', requestId)
  return false
}

type Handler<M extends ClientCommand = ClientCommand> = (
  ctx: ConnectionCtx,
  msg: M,
) => void | Promise<void>

const executeRoomSession = (
  room: Room,
  method: CustomSessionMethod,
  args: unknown[],
  local: () => SessionResponse,
): SessionResponse | Promise<SessionResponse> =>
  measureRule(room.customSessionExecutor ? 'worker' : 'native', () =>
    room.customSessionExecutor?.execute(method, args) ?? room.session.withCtx(local))

const useSessionResponse = (
  result: SessionResponse | Promise<SessionResponse>,
  use: (response: SessionResponse) => void | Promise<void>,
): void | Promise<void> => result instanceof Promise ? result.then(use) : use(result)

const commandActor = (ctx: ConnectionCtx): string => {
  if (!ctx.authenticated) throw new CommandError('command_scope_expired', 'Authentication is required')
  if (ctx.currentUserId) return `user:${ctx.currentUserId}`
  if (process.env.NODE_ENV !== 'production' && ['1', 'true'].includes(process.env.ALLOW_ANONYMOUS_WS ?? '')) return 'development-anonymous'
  throw new CommandError('command_scope_expired', 'Authentication is required')
}

async function handleCommandScope(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'getCommandScope' }>): Promise<void> {
  if (!ctx.commands) throw new Error('Command storage is unavailable')
  const scope = await ctx.commands.resumeScope(commandActor(ctx), msg.scopeId)
  ctx.broadcaster.sendTo(ctx.ws, { type: 'commandScope', scope, requestId: msg.requestId })
}

async function handleCommandReceipt(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'getCommandReceipt' }>): Promise<void> {
  if (!ctx.commands) throw new Error('Command storage is unavailable')
  const result = await ctx.commands.lookup(commandActor(ctx), msg.identity)
  ctx.broadcaster.sendTo(ctx.ws, result.kind === 'completed'
    ? { type: 'commandReceipt', status: 'completed', receipt: result.receipt, requestId: msg.requestId }
    : { type: 'commandReceipt', status: result.kind, identity: msg.identity, requestId: msg.requestId })
}

async function handleAuth(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'auth' }>): Promise<Awaited<void>> {
  if (!msg.token) {
    sendCommandError(ctx, 'invalid or expired token', msg.requestId)
    return
  }
  const user = (await validateSession(msg.token))
  if (!user) {
    sendCommandError(ctx, 'invalid or expired token', msg.requestId)
    return
  }
  ctx.authenticated = true
  ctx.currentUserId = user.id
  ctx.sessionToken = msg.token
  ctx.broadcaster.authenticate(ctx.ws, msg.token)
  ctx.broadcaster.sendTo(ctx.ws, { type: 'authOk', userId: user.id, username: user.username })
}

const detachPreviousRoom = async (ctx: ConnectionCtx, next: Room, previous = ctx.currentRoom): Promise<void> => {
  if (!previous || previous === next) return
  const player = previous.players.find(candidate => candidate.ws === ctx.ws)
  previous.players = previous.players.filter(candidate => candidate.ws !== ctx.ws)
  ctx.registry.touchActivity(previous.id, Date.now())
  if (player) await ctx.broadcaster.broadcastEvent(previous, { type: 'playerDisconnected', playerIndex: player.playerIndex })
}

async function handleCreateRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'createRoom' }>): Promise<Awaited<void | Promise<void>>> {
  const ordinaryRoomCount = [...ctx.registry.iter()]
    .filter((room) => !isDevRoom(room.id))
    .length
  if (ordinaryRoomCount >= MAX_ORDINARY_ROOMS) {
    sendCommandError(ctx, 'room capacity reached', msg.requestId)
    return
  }
  const persistence = (await ctx.committer?.canCreateRoom()) ?? { ok: false, error: 'room recording is unavailable' }
  if (!persistence.ok) {
    commandOutcome('blocked')
    sendCommandError(ctx, persistence.error, msg.requestId)
    return
  }
  const roomId = ctx.activeCommand?.request.resultRoomId ?? (await generateRoomId(ctx))
  if (!roomId) { sendCommandError(ctx, 'unable to allocate room id', msg.requestId); return }
  const draftOptions = parseDraftOptions(msg as Record<string, unknown>)
  if (!draftOptions.ok) { sendCommandError(ctx, draftOptions.error, msg.requestId); return }
  const setup = parseGameSetupRequest(msg as Record<string, unknown>, draftOptions.value)
  const maxPlayers = setup.playerCount
  const enableCommunityDeck = setup.enableCommunityDeck
  const customCardDbIds = resolveCustomCardDbIds(msg as Record<string, unknown>, enableCommunityDeck)
  const executionStamp = ctx.authority ? await new ExecutionAccess(ctx.authority.directory.db).capture(customCardDbIds, ctx.currentUserId ? [ctx.currentUserId] : []) : undefined
  const loadedCustomCards = (await loadCustomCards(customCardDbIds, ctx.currentUserId, { liveOnly: true }))
  if (loadedCustomCards.hasNotLive) {
    sendCommandError(ctx, 'cards must pass review approval and be published live before they can be used in a room; unreviewed cards are only playable in the workshop sandbox', msg.requestId)
    return
  }
  const customCards = loadedCustomCards.cards
  let created: ReturnType<typeof createIsolatedGameSession>
  try {
    created = createIsolatedGameSession(
      undefined,
      customCards.length > 0 ? customCards : undefined,
      buildInitialStateOptions(setup),
    )
  } catch (err) {
    commandOutcome('error')
    sendCommandError(ctx, err instanceof Error ? err.message : String(err), msg.requestId)
    return
  }
  if (created.executor && !created.executor.reserveWorkerSlot()) {
    created.executor.dispose()
    created.session.dispose()
    sendCommandError(ctx, 'executable room capacity reached', msg.requestId)
    return
  }
  const room: Room = {
    id: roomId,
    owner: ctx.activeCommand?.owner,
    executionStamp,
    session: created.session,
    ...(created.executor ? { customSessionExecutor: created.executor } : {}),
    players: [],
    seatOwners: ctx.currentUserId
      ? [{ playerIndex: 0, userId: ctx.currentUserId }]
      : [],
    maxPlayers,
    version: 0,
    status: 'waiting',
    ...(setup.hotseat ? { hotseat: true } : {}),
    createdBy: ctx.currentUserId,
    customCardDbIds: loadedCustomCards.loadedDbIds,
    customCards,
    enableParentCards: setup.enableParentCards,
    draftParents: setup.draftParents,
    draftMode: draftOptions.value?.draftMode,
    draftPoolSize: draftOptions.value?.draftPoolSize,
    enableThroughTheSeasons: setup.enableThroughTheSeasons,
    enableFarmersOfTheMoor: setup.enableFarmersOfTheMoor,
    allowIncompleteFarmersOfTheMoorMinorDeal: setup.allowIncompleteFarmersOfTheMoorMinorDeal,
    enableSnakeOpening: setup.enableSnakeOpening,
  }
  ctx.committer?.lockNewRoom(room)
  const name = typeof (msg as Record<string, unknown>).name === 'string'
    ? (msg as Record<string, unknown>).name as string
    : ''
  room.players.push({ ws: ctx.ws, playerIndex: 0, name, userId: ctx.currentUserId })
  if (room.customSessionExecutor) await room.customSessionExecutor.updatePlayerNames([[0, name]])
  else room.session.updatePlayerName(0, name)
  try {
    await ctx.checkpoint.recordCreated(room, !room.hotseat && ctx.activeCommand ? {
      receipt: { request: ctx.activeCommand.request, outcome: { ok: true, roomId, roomVersion: 0, playerIndex: 0 } },
    } : undefined)
  } catch (error) {
    room.customSessionExecutor?.dispose()
    room.session.dispose()
    throw error
  }
  await detachPreviousRoom(ctx, room)
  ctx.currentRoom = room
  ctx.currentPlayerIndex = 0
  const confirmCreated = async (): Promise<void> => {
    ctx.registry.set(room)
    await ctx.broadcaster.sendRoomEvent(ctx.ws, room, {
      type: 'roomCreated',
      roomId,
      playerIndex: 0,
      maxPlayers,
      ...(setup.hotseat ? { hotseat: true } : {}),
    })
  }
  // A hotseat room has nobody left to wait for — its creator holds every seat,
  // so it starts as soon as it exists instead of sitting in the waiting room.
  // Its confirmation waits for that first deal: once the client sees
  // `roomCreated` it stops listening for creation errors, so confirming a room
  // that then fails to initialize would strand it in the waiting state.
  if (!room.hotseat) {
    await confirmCreated()
    return
  }
  room.status = 'playing'
  room.startedAt ??= Date.now()
  return (await useSessionResponse(
    executeRoomSession(room, 'getState', [], () => room.session.getState()),
    async (resp) => {
      // An executable community card can fail or time out on this first call;
      // starting the game anyway would leave the client in a ready game backed
      // by a failed session, with the error never shown.
      if (!resp.ok) {
        room.customSessionExecutor?.dispose()
        room.session.dispose()
        ctx.registry.delete(room.id)
        ctx.registry.clearActivity(room.id)
        ;(await ctx.checkpoint.discardRoom(room.id, { owner: room.owner, expectedVersion: room.version }))
        ctx.currentRoom = null
        sendCommandError(ctx, resp.error ?? 'unable to initialize game', msg.requestId)
        return
      }
      return (await publishInitialState(ctx, room, resp, msg.requestId, confirmCreated, async () => {
        await ctx.broadcaster.broadcastEvent(room, { type: 'gameStarted' })
      }))
    },
  ))
}

async function handleJoinRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'joinRoom' }>): Promise<Awaited<void | Promise<void>>> {
  const roomId = msg.roomId
  if (msg.intent !== undefined && msg.intent !== 'join' && msg.intent !== 'resume') {
    sendCommandError(ctx, 'invalid join intent', msg.requestId)
    return
  }
  const lifecycle = (await ctx.gameContextStore?.lifecycle(roomId))
  if (lifecycle && lifecycle !== 'active') {
    sendCommandError(
      ctx,
      'game context changed',
      msg.requestId,
      'context_changed',
      lifecycle,
    )
    return
  }
  const room = ctx.registry.get(roomId)
  if (!room) {
    sendCommandError(ctx, 'room not found', msg.requestId)
    return
  }
  // A hotseat game belongs to one device: nobody else may take a seat in it.
  // An anonymous room has no owner to check against — it stays as open as any
  // other anonymous room rather than becoming unreachable for everyone.
  if (room.hotseat && room.createdBy && ctx.currentUserId !== room.createdBy) {
    sendCommandError(
      ctx,
      'this is a local hotseat game; only its owner can rejoin',
      msg.requestId,
      'not_participant',
      'active',
    )
    return
  }
  const blocked = ctx.committer?.blockedError(room.id)
  if (blocked) {
    commandOutcome('blocked')
    const waiting = ctx.committer?.waitUntilReady(room.id, (error) => {
      if (ctx.ws.readyState !== ctx.ws.OPEN) return
      if (ctx.currentRoom) return
      if (error) {
        sendCommandError(ctx, `room saving is paused: ${error}`, msg.requestId)
        return
      }
      ctx.broadcaster.sendTo(ctx.ws, {
        type: 'roomPersistenceResumed',
        roomId: room.id,
      })
      void Promise.resolve(dispatch(ctx, msg)).catch(error => sendCommandError(ctx, String(error), msg.requestId))
    })
    if (waiting) {
      ctx.broadcaster.sendTo(ctx.ws, {
        type: 'roomPersistencePaused',
        roomId: room.id,
      })
      return
    }
    sendCommandError(ctx, `room saving is paused: ${blocked}`, msg.requestId)
    return
  }
  const wasPlaying = room.status === 'playing'
  let requestedPlayerIndex: number | undefined
  if (msg.intent === 'resume') {
    if (!ctx.currentUserId) {
      sendCommandError(ctx, 'login required', msg.requestId, 'login_required', 'active')
      return
    }
    const owner = room.seatOwners?.find((candidate) =>
      candidate.userId === ctx.currentUserId
    )
    if (!owner) {
      sendCommandError(
        ctx,
        'only original participants can resume this game',
        msg.requestId,
        'not_participant',
        'active',
      )
      return
    }
    requestedPlayerIndex = owner.playerIndex
  } else {
    requestedPlayerIndex = typeof msg.requestedPlayerIndex === 'number'
      ? msg.requestedPlayerIndex
      : undefined
  }
  const requested = resolveJoinRequestPlayerIndex(
    room,
    requestedPlayerIndex,
    ctx.currentUserId,
  )
  if (!requested.ok) {
    sendCommandError(ctx, requested.error, msg.requestId)
    return
  }
  const seat = resolveJoinPlayerIndex(room, requested.requestedPlayerIndex, ctx.currentUserId)
  if (!seat.ok) { sendCommandError(ctx, seat.error, msg.requestId); return }
  const previousCtxRoom = ctx.currentRoom
  const previousPlayerIndex = ctx.currentPlayerIndex
  const previousPlayers = room.players
  const previousSeatOwners = room.seatOwners
  const previousStatus = room.status
  const previousStartedAt = room.startedAt
  const previousNames = room.session.state.players.map((player, index) => [index, player.nameIsDefault ? '' : player.name] as [number, string])
  ctx.currentRoom = room
  ctx.currentPlayerIndex = seat.playerIndex
  const requestedName = typeof (msg as Record<string, unknown>).name === 'string'
    ? (msg as Record<string, unknown>).name as string
    : ''
  const currentPlayer = room.session.state.players[ctx.currentPlayerIndex]
  const name = wasPlaying && typeof msg.name !== 'string'
    ? currentPlayer?.nameIsDefault ? '' : currentPlayer?.name ?? requestedName
    : requestedName
  const replacedPlayer = seat.replacedExistingPlayer
    ? room.players.find(
      (player) => player.playerIndex === ctx.currentPlayerIndex,
    )
    : undefined
  const rollbackJoin = async (error: string): Promise<void> => {
    room.players = previousPlayers
    room.seatOwners = previousSeatOwners
    room.status = previousStatus
    if (previousStartedAt === undefined) delete room.startedAt
    else room.startedAt = previousStartedAt
    ctx.currentRoom = previousCtxRoom
    ctx.currentPlayerIndex = previousPlayerIndex
    if (!wasPlaying) {
      if (room.customSessionExecutor) await room.customSessionExecutor.updatePlayerNames(previousNames)
      else for (const [index, name] of previousNames) room.session.updatePlayerName(index, name)
    }
    sendCommandError(ctx, error, msg.requestId)
  }
  const publishSeatReplacement = (): void => {
    if (replacedPlayer && replacedPlayer.ws !== ctx.ws) {
      ctx.broadcaster.sendTo(replacedPlayer.ws, {
        type: 'seat_replaced',
        roomId,
        playerIndex: ctx.currentPlayerIndex,
      })
      try { replacedPlayer.ws.close(4001, 'seat replaced') } catch { /* ignore */ }
    }
  }
  room.players = room.players.filter(
    (player) => player.ws !== ctx.ws && player.playerIndex !== ctx.currentPlayerIndex,
  )
  const seatOwners = new Map(
    (room.seatOwners ?? [])
      .map((owner) => [owner.playerIndex, owner.userId] as const),
  )
  for (const player of room.players) {
    if (player.userId) seatOwners.set(player.playerIndex, player.userId)
  }
  seatOwners.delete(ctx.currentPlayerIndex)
  if (ctx.currentUserId) seatOwners.set(ctx.currentPlayerIndex, ctx.currentUserId)
  room.seatOwners = [...seatOwners]
    .sort(([left], [right]) => left - right)
    .map(([playerIndex, userId]) => ({ playerIndex, userId }))
  room.players.push({ ws: ctx.ws, playerIndex: ctx.currentPlayerIndex, name, userId: ctx.currentUserId })
  room.players.sort((a, b) => a.playerIndex - b.playerIndex)
  ctx.registry.touchActivity(room.id, Date.now())
  const playerCount = roomOccupiedSeatCount(room)
  // The hotseat owner is the whole table, so rejoining is always a full room.
  const roomFull = room.hotseat === true || playerCount >= room.maxPlayers
  const starting = !wasPlaying && roomFull
  if (roomFull) {
    room.status = 'playing'
    room.startedAt ??= Date.now()
  }
  const players = [...new Set([
    ...room.players.map((player) => player.playerIndex),
    ...(room.seatOwners ?? []).map((owner) => owner.playerIndex),
  ])]
    .sort((left, right) => left - right)
    .map((playerIndex) => ({
      playerIndex,
      name: room.players.find((player) => player.playerIndex === playerIndex)?.name
        ?? room.session.state.players[playerIndex]?.name
        ?? `Player ${playerIndex + 1}`,
    }))
  const publishJoin = async (): Promise<void> => {
    await detachPreviousRoom(ctx, room, previousCtxRoom)
    publishSeatReplacement()
    await ctx.broadcaster.sendRoomEvent(ctx.ws, room, {
      type: 'roomJoined',
      roomId,
      playerIndex: ctx.currentPlayerIndex,
      status: room.status === 'waiting' ? 'waiting' : 'playing',
      players,
      maxPlayers: room.maxPlayers,
      ...(room.hotseat ? { hotseat: true } : {}),
    })
    await ctx.broadcaster.broadcastEvent(room, {
      type: 'playerJoined',
      playerIndex: ctx.currentPlayerIndex,
      name,
      playerCount,
      maxPlayers: room.maxPlayers,
    })
  }
  const finishJoin = async (updatedResponse?: SessionResponse): Promise<Awaited<void | Promise<void>>> => {
    if (starting && updatedResponse && !updatedResponse.ok) {
      await rollbackJoin(updatedResponse.error ?? 'unable to initialize game')
      return
    }
    if (starting) {
      const response = updatedResponse ?? executeRoomSession(
        room,
        'getState',
        [],
        () => room.session.getState(),
      )
      return (await useSessionResponse(response, async (resp) => {
        return (await publishInitialState(ctx, room, resp, undefined, publishJoin, async () => {
          await ctx.broadcaster.broadcastEvent(room, { type: 'gameStarted' })
        }))
      }))
    }
    try {
      await ctx.checkpoint.recordMeta(room, { resume: true })
    } catch (error) {
      await rollbackJoin(error instanceof Error ? error.message : String(error))
      return
    }
    await publishJoin()
    if (wasPlaying) {
      return useSessionResponse(
        executeRoomSession(room, 'getState', [], () => room.session.getState()),
        (resp) => ctx.broadcaster.sendStateTo(ctx.ws, room, resp, msg.requestId),
      )
    }
  }
  if (wasPlaying) return finishJoin()
  const names = starting
    ? room.players.map((player) => [player.playerIndex, player.name] as [number, string])
    : [[ctx.currentPlayerIndex, name] as [number, string]]
  if (!room.customSessionExecutor) {
    for (const [playerIndex, playerName] of names) room.session.updatePlayerName(playerIndex, playerName)
    return finishJoin()
  }
  const updated = starting
    ? room.customSessionExecutor.execute('updatePlayerNames', [names])
    : room.customSessionExecutor.updatePlayerNames(names)
  return updated instanceof Promise
    ? updated.then((response) => finishJoin(starting ? response : undefined))
    : finishJoin()
}

async function handleDissolveRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'dissolveRoom' }>): Promise<Awaited<void>> {
  const room = requireRoom(ctx, msg.requestId)
  if (!room) return
  const blocked = ctx.committer?.blockedError(room.id)
  if (blocked) {
    sendCommandError(ctx, `room saving is paused: ${blocked}`, msg.requestId)
    return
  }
  const result = (await ctx.lobby.dissolveRoomById(room.id, ctx.currentUserId, ctx.activeCommand ? { receipt: { request: ctx.activeCommand.request, outcome: { ok: true, roomId: room.id } } } : undefined))
  if (!result.ok) { sendCommandError(ctx, result.error ?? 'dissolve failed', msg.requestId); return }
  ctx.currentRoom = null
}

async function handleGetHistory(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'getHistory' }>): Promise<void> {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const blocked = ctx.committer?.blockedError(room.id)
  if (blocked) { sendCommandError(ctx, `room saving is paused: ${blocked}`, msg.requestId); return }
  if (msg.cursor !== undefined && (typeof msg.cursor !== 'string' || msg.cursor.length > 1024)) {
    sendCommandError(ctx, 'invalid history cursor', msg.requestId); return
  }
  try {
    const canonical = room.customSessionExecutor?.serializedStateForPersistence()?.frame
      ?? room.session.withCtx(() => serializeState(room.session.state, {}))
    const viewerPlayerId = room.session.state.players[ctx.currentPlayerIndex]?.id ?? null
    const page = buildRoomHistoryPage(withRoomParticipantNames(room, canonical), viewerPlayerId, msg.cursor)
    await ctx.broadcaster.sendRoomEvent(ctx.ws, room, { type: 'historyPage', roomId: room.id, requestId: msg.requestId, page })
  } catch (error) {
    sendCommandError(ctx, error instanceof Error ? error.message : String(error), msg.requestId, error instanceof HistoryBranchChangedError ? 'history_branch_changed' : undefined)
  }
}

function handleGetState(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'getState' }>): void | Promise<void> {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (msg.unredacted && !assertDevCommandAllowed(ctx, room, msg.requestId)) return
  const blocked = ctx.committer?.blockedError(room.id)
  if (blocked) {
    sendCommandError(ctx, `room saving is paused: ${blocked}`, msg.requestId)
    return
  }
  return useSessionResponse(
    executeRoomSession(room, 'getState', [], () => room.session.getState()),
    (resp) => ctx.broadcaster.sendStateTo(
      ctx.ws,
      room,
      resp,
      msg.requestId,
      'reconnect',
      msg.unredacted ? 'debug' : undefined,
    ),
  )
}

function handleAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'action' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  const seat = actingSeat(ctx)
  return useSessionResponse(
    executeRoomSession(
      room,
      'takeAction',
      [seat, msg.spaceId],
      () => room.session.takeAction(seat, msg.spaceId),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'action', seat),
  )
}

function handleSpecialAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'specialAction' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  const seat = actingSeat(ctx)
  return useSessionResponse(
    executeRoomSession(
      room,
      'takeSpecialAction',
      [seat, msg.cardId, msg.actionId, msg.payload],
      () => room.session.takeSpecialAction(seat, msg.cardId, msg.actionId, msg.payload),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'action', seat),
  )
}

function handleChoice(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'choice' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  const seat = actingSeat(ctx)
  return useSessionResponse(
    executeRoomSession(
      room,
      'resolveChoice',
      [seat, msg.value, msg.payload],
      () => room.session.resolveChoice(seat, msg.value, msg.payload),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'choice', seat),
  )
}

function handleAnytime(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'anytime' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  const seat = actingSeat(ctx)
  return useSessionResponse(
    executeRoomSession(
      room,
      'takeAnytimeAction',
      [seat, msg.actionId],
      () => room.session.takeAnytimeAction(seat, msg.actionId),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'anytime', seat),
  )
}

function handleOrdinaryDrawKeep(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'ordinaryDrawKeep' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  const seat = namedSeat(ctx, msg.playerIndex)
  return useSessionResponse(
    executeRoomSession(
      room,
      'resolveOrdinaryCardDrawChoice',
      [seat, msg.choiceId, msg.keepCardId],
      () => room.session.resolveOrdinaryCardDrawChoice(seat, msg.choiceId, msg.keepCardId),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'choice', seat),
  )
}

function handleRoundEnd(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'roundEnd' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  return useSessionResponse(
    executeRoomSession(room, 'performRoundEnd', [], () => room.session.performRoundEnd()),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'action'),
  )
}

function handleCommitSelection(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'commitSelection' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  const seat = namedSeat(ctx, msg.playerIndex)
  return useSessionResponse(
    executeRoomSession(
      room,
      'commitSelectionChoice',
      [seat, msg.payload],
      () => room.session.commitSelectionChoice(seat, msg.payload),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'choice', seat),
  )
}

function handleParentSubmit(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'parentSubmit' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  const seat = namedSeat(ctx, msg.playerIndex)
  return useSessionResponse(
    executeRoomSession(
      room,
      'submitParentSelection',
      [seat, msg.selection],
      () => room.session.submitParentSelection(seat, msg.selection),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'choice', seat),
  )
}

function handleUndoStep(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'undoStep' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  const seat = actingSeat(ctx)
  return useSessionResponse(
    executeRoomSession(room, 'undoStep', [], () => room.session.undoStep()),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'undo', seat),
  )
}

function handleUndoAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'undoAction' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  const seat = actingSeat(ctx)
  return useSessionResponse(
    executeRoomSession(room, 'undoAction', [], () => room.session.undoAction()),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'undo', seat),
  )
}

async function handleNewGame(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'newGame' }>): Promise<Awaited<void | Promise<void>>> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  const persistence = (await ctx.committer?.canCreateRoom()) ?? { ok: false, error: 'room recording is unavailable' }
  if (!persistence.ok) {
    commandOutcome('blocked')
    sendCommandError(ctx, persistence.error, msg.requestId)
    return
  }
  const previousRoomId = room.id
  const previousOwner = room.owner
  const previousVersion = room.version
  // A rematch is a new game: reload through the current gate instead of
  // reusing the embedded snapshot, so takeover (#642) and unpublish apply
  // to the fresh room while the finished game stays untouched. The id list
  // is refreshed alongside so a stale id cannot mark this room for a later
  // takedown it does not deserve.
  const enableCommunityDeck = room.session.state.enableCommunityDeck
  const reloaded = (await loadCustomCards(
    enableCommunityDeck ? room.customCardDbIds ?? [] : [],
    room.createdBy,
    { liveOnly: true },
  ))
  const customCards = reloaded.cards
  const enableParentCards = room.enableParentCards ?? room.session.state.enableParentCards
  const draftMode = room.draftMode ?? room.session.state.draftMode
  const draftPoolSize = room.draftPoolSize ?? room.session.state.draftPoolSize
  const enableThroughTheSeasons = room.enableThroughTheSeasons ?? room.session.state.enableThroughTheSeasons
  const enableFarmersOfTheMoor = room.enableFarmersOfTheMoor ?? (room.session.state.enableFarmersOfTheMoor === true)
  const allowIncompleteFarmersOfTheMoorMinorDeal = room.allowIncompleteFarmersOfTheMoorMinorDeal ?? false
  const enableSnakeOpening = room.enableSnakeOpening ?? (room.session.state.enableSnakeOpening === true)
  let created: ReturnType<typeof createIsolatedGameSession>
  try {
    created = createIsolatedGameSession(
      // Only a dev room may pick its Explicit Seed (ADR-0020).
      typeof msg.seed === 'number' && isDevRoom(room.id) ? msg.seed : undefined,
      customCards.length > 0 ? customCards : undefined,
      {
        playerCount: room.maxPlayers,
        enableCommunityDeck,
        enableParentCards,
        ...(room.draftParents === false ? { draftParents: false } : {}),
        ...(draftMode === 'simultaneous'
          ? { draftMode, draftPoolSize: draftPoolSize ?? 7 }
          : {}),
        enableThroughTheSeasons,
        enableFarmersOfTheMoor,
        allowIncompleteFarmersOfTheMoorMinorDeal,
        enableSnakeOpening,
      },
    )
  } catch (err) {
    commandOutcome('error')
    sendCommandError(ctx, err instanceof Error ? err.message : String(err), msg.requestId)
    return
  }
  if (created.executor && !created.executor.reserveWorkerSlot()) {
    created.executor.dispose()
    created.session.dispose()
    sendCommandError(ctx, 'executable room capacity reached', msg.requestId)
    return
  }
  const nextRoomId = ctx.activeCommand?.request.resultRoomId ?? (await generateRoomId(ctx, fixedDevRoomRootId(previousRoomId)))
  if (!nextRoomId) {
    created.executor?.dispose()
    created.session.dispose()
    sendCommandError(ctx, 'unable to allocate room id', msg.requestId)
    return
  }
  const names = room.players.map((player) => [player.playerIndex, player.name] as [number, string])
  let response: SessionResponse | Promise<SessionResponse>
  if (created.executor) {
    response = created.executor.execute('updatePlayerNames', [names])
  } else {
    for (const [playerIndex, name] of names) created.session.updatePlayerName(playerIndex, name)
    response = created.session.withCtx(() => created.session.getState())
  }
  return (await useSessionResponse(
    response,
    async (resp) => {
      if (!resp.ok) {
        created.executor?.dispose()
        created.session.dispose()
        sendCommandError(ctx, resp.error ?? 'unable to initialize game', msg.requestId)
        return
      }
      const nextRoom: Room = {
        ...room,
        id: nextRoomId,
        owner: ctx.authority && previousOwner ? (await ctx.authority.directory.replacement(nextRoomId, previousRoomId, previousOwner, isDevRoom(nextRoomId))).owner : undefined,
        session: created.session,
        customSessionExecutor: created.executor,
        version: 0,
        seatOwners: room.players.flatMap(player => player.userId ? [{ playerIndex: player.playerIndex, userId: player.userId }] : []),
        status: isDevRoom(nextRoomId) || room.hotseat === true || room.players.length >= room.maxPlayers ? 'playing' : 'waiting',
        enableParentCards, draftMode, draftPoolSize, enableThroughTheSeasons,
        enableFarmersOfTheMoor, allowIncompleteFarmersOfTheMoorMinorDeal, enableSnakeOpening,
        customCardDbIds: reloaded.loadedDbIds, customCards,
      }
      nextRoom.startedAt = nextRoom.status === 'playing' ? Date.now() : undefined
      ctx.committer!.lockNewRoom(nextRoom)
      const adopt = async (): Promise<void> => {
        const previousSession = room.session
        ctx.registry.delete(previousRoomId)
        ctx.registry.clearActivity(previousRoomId)
        previousSession.dispose()
        // Connections retain this Room object; change its identity only after
        // the replacement and retirement have committed together.
        Object.assign(room, nextRoom)
        ctx.registry.set(room)
        ctx.registry.touchActivity(room.id, Date.now())
        ctx.checkpoint.markInactive(previousRoomId)
        await ctx.committer!.retireRoom(previousRoomId)
      }
      if (nextRoom.status === 'playing') {
        return publishInitialState(ctx, nextRoom, resp, msg.requestId, adopt, () => {}, previousRoomId, previousOwner, previousVersion)
      }
      await ctx.checkpoint.recordCreated(nextRoom, {
        retireRoomId: previousRoomId,
        retiredOwner: previousOwner,
        retiredVersion: previousVersion,
        ...(ctx.activeCommand ? { receipt: { request: ctx.activeCommand.request, outcome: { ok: true, roomId: nextRoomId, roomVersion: 0, playerIndex: ctx.currentPlayerIndex } } } : {}),
      })
      await adopt()
      await ctx.broadcaster.broadcastEvent(room, {
        type: 'roomWaiting', roomId: room.id,
        players: room.players.map(({ playerIndex, name }) => ({ playerIndex, name })),
        maxPlayers: room.maxPlayers,
      })
      await ctx.broadcaster.broadcastCommitted(room, resp, 'reconnect', msg.requestId)
    },
  ))
}

function handleLoadGame(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'loadGame' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  // Replacing the authoritative state is a dev command like the others below.
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  return useSessionResponse(
    executeRoomSession(room, 'loadState', [msg.state], () => room.session.loadState(msg.state)),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'reconnect'),
  )
}

function handleDevSetResources(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devSetResources' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'devSetResources',
      [msg.playerIndex, msg.resources],
      () => room.session.devSetResources(msg.playerIndex, msg.resources),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'dev'),
  )
}

function handleDevSetRound(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devSetRound' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  return useSessionResponse(
    executeRoomSession(room, 'devSetRound', [msg.round], () => room.session.devSetRound(msg.round)),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'dev'),
  )
}

function handleDevDrawCard(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devDrawCard' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'devDrawCard',
      [msg.playerIndex, msg.cardId],
      () => room.session.devDrawCard(msg.playerIndex, msg.cardId),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'dev'),
  )
}

function handleDevPlayCard(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devPlayCard' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'devPlayCard',
      [msg.playerIndex, msg.cardId],
      () => room.session.devPlayCard(msg.playerIndex, msg.cardId),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'dev'),
  )
}

function handleDevCreatePasture(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devCreatePasture' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'startDevFenceSelect',
      [ctx.currentPlayerIndex],
      () => room.session.startDevFenceSelect(ctx.currentPlayerIndex),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'action'),
  )
}

function handleDraftSubmit(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'draftSubmit' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnPlayerId(ctx, msg.playerId, msg.requestId)) return
  const draftSeat = room.hotseat === true
    ? room.session.getState().state.players.findIndex((player) => player.id === msg.playerId)
    : ctx.currentPlayerIndex
  return useSessionResponse(
    executeRoomSession(
      room,
      'submitDraftPick',
      [msg.playerId, msg.pick],
      () => room.session.submitDraftPick(msg.playerId, msg.pick),
    ),
    (resp) => publishCommandResponse(
      ctx,
      room,
      resp,
      msg,
      'draftSubmit',
      draftSeat >= 0 ? draftSeat : ctx.currentPlayerIndex,
    ),
  )
}

const handlers: { [K in ClientCommand['type']]: Handler<Extract<ClientCommand, { type: K }>> } = {
  auth: handleAuth,
  getCommandScope: handleCommandScope,
  getCommandReceipt: handleCommandReceipt,
  createRoom: handleCreateRoom,
  joinRoom: handleJoinRoom,
  dissolveRoom: handleDissolveRoom,
  getState: handleGetState,
  getHistory: handleGetHistory,
  action: handleAction,
  specialAction: handleSpecialAction,
  choice: handleChoice,
  anytime: handleAnytime,
  ordinaryDrawKeep: handleOrdinaryDrawKeep,
  roundEnd: handleRoundEnd,
  commitSelection: handleCommitSelection,
  parentSubmit: handleParentSubmit,
  undoStep: handleUndoStep,
  undoAction: handleUndoAction,
  newGame: handleNewGame,
  loadGame: handleLoadGame,
  devSetResources: handleDevSetResources,
  devSetRound: handleDevSetRound,
  devDrawCard: handleDevDrawCard,
  devPlayCard: handleDevPlayCard,
  devCreatePasture: handleDevCreatePasture,
  draftSubmit: handleDraftSubmit,
}

export async function dispatch(ctx: ConnectionCtx, msg: ClientCommand): Promise<void> {
  return observeCommand({ command: msg.type, requestId: msg.requestId, socket: ctx.ws, round: roundTag(ctx.currentRoom?.session.state) }, () => dispatchCommand(ctx, msg))
}
async function dispatchCommand(ctx: ConnectionCtx, msg: ClientCommand): Promise<void> {
  if (msg.type === 'joinRoom' && ctx.authority) await ctx.authority.load(msg.roomId)
  const fn = handlers[msg.type] as Handler | undefined
  if (!fn) { sendCommandError(ctx, `unknown command: ${msg.type}`, msg.requestId); return }
  const acceptedRoom = ctx.currentRoom
  const acceptedRoomId = acceptedRoom?.id
  const acceptedSession = acceptedRoom?.session
  const acceptedPlayerIndex = ctx.currentPlayerIndex
  const room = msg.type === 'joinRoom' ? ctx.registry.get(msg.roomId) : acceptedRoom
  // A move touches both rooms. Reserve all affected queues together before
  // awaiting any work, so two opposite moves cannot deadlock or pass a commit.
  const queuedRooms = [...new Set([acceptedRoom, room].filter((value): value is Room => !!value))]
  const run = async (): Promise<void> => {
    const endPreflight = startObservation('preflight')
    let request: CommandRequest | undefined
    const commands = ctx.commands
    try {
      if (ctx.sessionToken && !(await validateSession(ctx.sessionToken))) { commandOutcome('canceled'); ctx.ws.close(1008, 'session revoked'); return }
      const writes = !['auth', 'joinRoom', 'getState', 'getHistory', 'getCommandScope', 'getCommandReceipt'].includes(msg.type)
      if (writes) {
        if (!commands || !msg.commandContext) throw new CommandError('command_identity_required', 'A stable command identity is required')
        const targetRoomId = msg.type === 'createRoom' ? null : msg.commandContext.roomId ?? null
        const actor = commandActor(ctx)
        const prior = await commands.lookup(actor, msg.commandContext)
        let owner: OwnerToken | undefined
        const reserve = (roomId?: string) => commands.reserve(actor, msg.commandContext!, targetRoomId, msg, msg.type === 'newGame' && targetRoomId ? fixedDevRoomRootId(targetRoomId) : null, roomId)
        const reservation = msg.type === 'createRoom' && ctx.authority && prior.kind !== 'completed'
          ? await commands.db.transaction(async () => {
            if (!msg.commandContext?.allocationId) throw new RoomOwnershipError('Creation allocation is required')
            const allocation = await ctx.authority!.directory.consumeAllocation(actor, msg.commandContext.allocationId, msg.commandContext, ctx.authority!.instanceId)
            owner = allocation.owner
            return reserve(allocation.roomId)
          })()
          : await reserve()
        if (reservation.kind === 'completed') {
          commandOutcome('duplicate')
          ctx.broadcaster.sendTo(ctx.ws, { type: 'commandReceipt', status: 'completed', receipt: reservation.receipt, requestId: msg.requestId })
          if (ctx.currentRoom?.id === reservation.receipt.outcome.roomId) await handleGetState(ctx, { type: 'getState', requestId: msg.requestId })
          return
        }
        request = reservation.request
        ctx.activeCommand = { request, owner }
        if (msg.type !== 'createRoom') {
          if (!targetRoomId || ctx.currentRoom?.id !== targetRoomId) throw new CommandError('command_input_stale', 'Resume the original room before retrying this command')
          assertCommandInput(msg.type, msg.commandContext, ctx.currentRoom.version, ctx.currentRoom.inputWindow)
        }
      }
      if (ctx.currentRoom && !['auth', 'getCommandScope', 'getCommandReceipt'].includes(msg.type)) await ctx.authority?.assert(ctx.currentRoom)
      if (msg.type === 'joinRoom') { const joined = ctx.registry.get(msg.roomId); if (joined) await ctx.authority?.assert(joined) }
      if (
        ctx.currentRoom !== acceptedRoom
        || acceptedRoom?.id !== acceptedRoomId
        || acceptedRoom?.session !== acceptedSession
        || ctx.currentPlayerIndex !== acceptedPlayerIndex
      ) {
        commandOutcome('stale')
        sendCommandError(ctx, 'connection context changed before command ran', msg.requestId, 'command_input_stale')
      } else {
        endPreflight()
        await fn(ctx, msg as never)
      }
    } catch (error) {
      endPreflight('error')
      if (error instanceof ExecutionRevokedError) { commandOutcome('canceled'); ctx.ws.close(1008, error.message); return }
      if (error instanceof RoomOwnershipError) { commandOutcome('stale'); ctx.ws.close(1012, 'room owner changed'); return }
      commandOutcome(error instanceof CommandError ? error.code === 'command_input_stale' ? 'stale' : 'rule_rejected' : 'error')
      if (!(error instanceof CommandError)) throw error
      sendCommandError(ctx, error.message, msg.requestId, error.code)
    } finally {
      endPreflight()
      const active = ctx.activeCommand
      ctx.activeCommand = undefined
      if (request && commands) {
        let result = await commands.lookup(request.actorId, request)
        if (result.kind !== 'completed' && active?.outcome) {
          await commands.db.transaction(async () => { await commands.complete(request!, active.outcome!) })()
          result = await commands.lookup(request.actorId, request)
        }
        if (result.kind === 'completed') {
          ctx.broadcaster.sendTo(ctx.ws, { type: 'commandReceipt', status: 'completed', receipt: result.receipt, requestId: msg.requestId })
          if (active?.outcome && !active.outcome.ok) sendCommandError(ctx, active.outcome.error ?? 'Command rejected', msg.requestId, active.outcome.code as CommandErrorCode | undefined)
        } else {
          ctx.broadcaster.sendTo(ctx.ws, { type: 'commandReceipt', status: 'pending', identity: { scopeId: request.scopeId, commandId: request.commandId }, requestId: msg.requestId })
        }
      }
    }
  }
  return enqueueRoomCommand(msg.commandContext, [ctx, ...queuedRooms], run)
}

/** Disconnect is ordered after already accepted work on this connection. */
export async function finishConnection(ctx: ConnectionCtx, work: () => void | Promise<void>): Promise<void> {
  await waitForConnection(ctx)
  if (ctx.currentRoom) await enqueueRoomTask(ctx.currentRoom, work)
  else await work()
}
