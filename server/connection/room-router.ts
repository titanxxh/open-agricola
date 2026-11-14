import { admitTeamMember, planTeamSeating, teamWaitingState } from '../game/team-room'
import { closePrereleaseSocket, isPrerelease, prereleaseCommandAllowed } from '../prerelease-access'
import { addRoomSpectator, isRoomSpectator, removeRoomSpectator } from '../game/room-spectators'
import { isPublicSpectatableRoom } from '../game/room'
import type { FenceSelectionQuote } from '../../shared/contract/protocol/game'
import { parseCommitSelectionPayload } from '../../shared/contract/protocol/commit-selection'
import { playerColorOptions } from '../../shared/contract/state-constants'
import { measure, measureRule, observeCommand, commandOutcome, roundTag, startObservation, rejectObservedCommand, captureCommandOutcome } from '../observability/metrics'
import { ExecutionAccess, ExecutionRevokedError } from '../game/execution-access'
import { RoomOwnershipError } from '../game/room-directory'
import type { OwnerToken } from '../game/room-directory'
import { CommandError, type CommandRequest } from '../game/command-store'
import { GameCreationStore, GameCreationError } from '../game/game-creation-store'
import { assertCommandInput } from '../game/command-input'
import type { CommandErrorCode } from '../../shared/contract/protocol/commands'
import { withRoomParticipantNames } from './history-presentation'
import { buildRoomHistoryPage, HistoryBranchChangedError, HistoryProjectionChangedError } from '../../shared/session/history-window'
import { enqueueRoomCommand, enqueueRoomTask, waitForConnection } from '../game/room-queue.ts'
import { serializeState } from '../../shared/session/serialization'
import { interactionRecipientPlayerId } from '../../shared/session/interaction-state-adapter'
import { randomUUID } from 'node:crypto'
import { agreeToGameEnd, buildGameTermination, createGameEndProposal, hasUnanimousAgreement } from '../game/game-end'
import type { GameEndProposal, GameTermination } from '../../shared/contract/protocol/game-termination'
import type { SessionResponse } from '../game/authoritative-session.ts'
import {
  fixedDevRoomRootId,
  isDevRoom,
  resolveJoinPlayerIndex,
  resolveJoinRequestPlayerIndex,
  roomOccupiedSeatCount,
  roomConnectedPlayerCount,
  removePlayerFromRoom,
  toRoomMeta,
  type Room,
} from '../game/room.ts'
import { validateSession } from '../auth.ts'
import { getDb } from '../db.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { CustomCodeManifest } from '../../shared/custom-code/types.ts'
import { canAccessRoom, parseRoomAccess } from '../game/room-access'
import type { ClientCommand, ServerEvent } from '../../shared/contract/protocol/ws.ts'
import type { StateUpdateCause } from '../../shared/contract/protocol/game.ts'
import type {
  GameContextLifecycle,
} from '../../shared/contract/protocol/game-context.ts'
import {
  loadLiveDraft,
} from '../workshop-drafts.ts'
import { resolveSoloWorkshopCards, workshopDraftToCustomCard } from '../game/workshop-room-cards'
import { isLoadableLive } from '../workshop-status.ts'
import type { ConnectionCtx } from './connection-ctx.ts'
import { refreshConnectionSeat } from './connection-ctx.ts'
import { connectionViewerMetadata, connectedSeatIndexes, controlledSeatIndexes, visiblePlayerIdsForConnection } from '../game/room-viewer'
import {
  replayIntentFromCommand,
} from '../game/room-committer.ts'
import {
  createIsolatedGameSession,
  type CustomSessionMethod,
} from '../game/custom-session-executor.ts'
import {
  buildInitialStateOptions,
  assertSupportedGameConfiguration,
  assertSupportedLoadedState,
  parseGameSetupRequest,
  resolveCustomCardDbIds,
  soloCreationConfiguration,
} from '../game/game-setup-options.ts'

const DRAFT_POOL_SIZE_DEFAULT = 7
const DRAFT_POOL_SIZE_MIN = 7
const DRAFT_POOL_SIZE_MAX = 10
type DraftRoomOptions = { draftMode: 'simultaneous'; draftPoolSize: number }

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
        // SAFETY: card_json stores the same card-definition metadata accepted
        // by the Workshop authoring boundary. JSON parsing preserves that shape;
        // this bridges the generic persistence DTO, without claiming validation.
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
  code?: Extract<ServerEvent, { type: 'error' }>['code'],
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
  const waitingMember = ctx.currentRoom.status === 'waiting' && ctx.currentRoom.teamMembers?.find(member =>
    member.userId === ctx.currentUserId && ctx.currentRoom?.waitingTeamConnections?.get(member.memberId) === ctx.ws)
  const activeSeat = !!waitingMember || ctx.currentRoom.players.some((player) =>
    player.ws === ctx.ws && player.playerIndex === ctx.currentPlayerIndex
  )
  if (!activeSeat) {
    sendCommandError(ctx, 'seat was replaced', requestId, 'seat_replaced')
    return null
  }
  return ctx.currentRoom
}

const requireReadableRoom = (ctx: ConnectionCtx, requestId?: string): Room | null => {
  if (!isRoomSpectator(ctx.currentRoom, ctx.ws)) return requireRoom(ctx, requestId)
  const room = ctx.currentRoom
  return room
}

const waitingRoomEvent = (room: Room): Extract<ServerEvent, { type: 'roomWaiting' }> => {
  const players = [...new Set([
    ...room.players.map((player) => player.playerIndex),
    ...(room.seatOwners ?? []).map((owner) => owner.playerIndex),
  ])]
    .sort((left, right) => left - right)
    .map((playerIndex) => ({
      playerIndex,
      connected: connectedSeatIndexes(room).includes(playerIndex),
      name: room.players.find((player) => player.playerIndex === playerIndex)?.name
        ?? room.session.state.players[playerIndex]?.name
        ?? `Player ${playerIndex + 1}`,
    }))
  return { type: 'roomWaiting', roomId: room.id, players, maxPlayers: room.maxPlayers, playerColors: room.session.state.players.map(player => player.color),
    ...(room.colorConfirmationPlayerIndex === undefined ? {} : { colorConfirmationPlayerIndex: room.colorConfirmationPlayerIndex }) }
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
  /** The executing seat, which may differ from the connection's primary seat. */
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
  retiredTermination?: GameTermination,
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
    retiredTermination,
    ...(ctx.activeCommand ? { receipt: { request: ctx.activeCommand.request, outcome: { ok: true, roomId: room.id, playerIndex: room.players.find(player => player.ws === ctx.ws)?.playerIndex ?? ctx.currentPlayerIndex } } } : {}),
    onReady: publishReady,
  }))
  if (result.kind === 'blocked') {
    commandOutcome('blocked')
    await notifyPersistencePaused(ctx, room)
    if (!ctx.committer.isRetrying(room.id)) {
      sendCommandError(ctx, result.error, requestId)
      return
    }
    return new Promise((resolve, reject) => {
      if (!ctx.committer?.waitUntilReady(room.id, (error, cause) => {
        finishObservation(error ? 'blocked' : 'committed')
        if (cause) reject(cause)
        else resolve()
      })) {
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

const actingSeat = (ctx: ConnectionCtx, room: Room, requestId?: string): number | null => {
  const seat = waitingSeat(room)
  return assertOwnSeat(ctx, seat, requestId) ? seat : null
}

/** The Interaction Player while an interaction is pending, otherwise the current rotation player. */
const waitingSeat = (room: Room): number => {
  const { players, currentPlayerIndex } = room.session.state
  const playerIds = players.map(player => player.id)
  const recipient = interactionRecipientPlayerId(room.session.getInteraction(), playerIds)
  return recipient === null ? currentPlayerIndex : playerIds.indexOf(recipient)
}

const assertMayUndo = (ctx: ConnectionCtx, room: Room, requestId?: string): boolean => {
  if (isDevRoom(room.id)) return true
  return assertOwnSeat(ctx, waitingSeat(room), requestId)
}

const assertOwnSeat = (ctx: ConnectionCtx, expectedPlayerIndex: unknown, requestId?: string): boolean => {
  if (typeof expectedPlayerIndex !== 'number') {
    sendCommandError(ctx, 'seat mismatch: you cannot act on another player', requestId)
    return false
  }
  if (!ctx.controlledPlayerIndices.has(expectedPlayerIndex)) {
    const seatCount = ctx.currentRoom?.session.state.players.length ?? 0
    const error = ctx.controlledPlayerIndices.size === seatCount
      ? 'seat out of range for this game'
      : 'seat mismatch: you cannot act on another player'
    sendCommandError(ctx, error, requestId)
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
  const playerIndex = state.players.findIndex(player => player.id === expectedPlayerId)
  return assertOwnSeat(ctx, playerIndex, requestId)
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
  if (!isPrerelease() && process.env.NODE_ENV !== 'production' && ['1', 'true'].includes(process.env.ALLOW_ANONYMOUS_WS ?? '')) return 'development-anonymous'
  throw new CommandError('command_scope_expired', 'Authentication is required')
}

async function handleCommandScope(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'getCommandScope' }>): Promise<void> {
  if (!ctx.commands) throw new Error('Command storage is unavailable')
  const scope = await ctx.commands.resumeScope(commandActor(ctx), msg.scopeId)
  if (Object.hasOwn(msg, 'clientCapabilities')) ctx.broadcaster.declareClientCapabilities(ctx.ws, msg.clientCapabilities)
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
  if (removeRoomSpectator(previous, ctx.ws)) return
  const player = previous.players.find(candidate => candidate.ws === ctx.ws)
  removePlayerFromRoom(previous, ctx.ws)
  const now = Date.now()
  ctx.registry.touchActivity(previous.id, now)
  const lifecycle = await ctx.gameContextStore?.lifecycle(previous.id)
  if (lifecycle && lifecycle !== 'active') return
  if (roomConnectedPlayerCount(previous) === 0) {
    if (ctx.authority) await ctx.authority.retainOffline(previous, now)
    else await ctx.gameContextStore?.ensureActiveExpiry(previous.id, previous.status === 'playing' ? 'playing' : 'waiting', now)
  }
  if (player) await ctx.broadcaster.broadcastEvent(previous, { type: 'playerDisconnected', playerIndex: player.playerIndex })
}


async function handleCreateRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'createRoom' }>): Promise<Awaited<void | Promise<void>>> {
  const persistence = (await ctx.committer?.canCreateRoom()) ?? { ok: false, error: 'room recording is unavailable' }
  if (!persistence.ok) {
    commandOutcome('blocked')
    sendCommandError(ctx, persistence.error, msg.requestId)
    return
  }
  const roomId = ctx.activeCommand?.request.resultRoomId ?? (await generateRoomId(ctx))
  if (!roomId) { sendCommandError(ctx, 'unable to allocate room id', msg.requestId); return }
  let input = msg
  if (msg.sourceGameContextId !== undefined) {
    const source = await new GameCreationStore(getDb()).completedSource(msg.sourceGameContextId, ctx.currentUserId)
    if (!source.ok) { sendCommandError(ctx, source.message, msg.requestId, source.code); return }
    input = { type: 'createRoom', ...source.record.configuration, name: msg.name }
  }
  const draftOptions = parseDraftOptions(input)
  if (!draftOptions.ok) { sendCommandError(ctx, draftOptions.error, msg.requestId); return }
  let setup: ReturnType<typeof parseGameSetupRequest>
  try { setup = parseGameSetupRequest(input, draftOptions.value) }
  catch (error) { sendCommandError(ctx, error instanceof Error ? error.message : 'Invalid game configuration', msg.requestId); return }
  const maxPlayers = setup.playerCount
  const access = await parseRoomAccess(msg.access, { creatorId: ctx.currentUserId, maxPlayers: setup.teamConfig?.mode === 'multihand' ? maxPlayers / setup.teamConfig.seatsPerTeam : maxPlayers, hotseat: setup.hotseat }, getDb())
  if (!access.ok) { sendCommandError(ctx, access.error, msg.requestId, access.code); return }
  if (maxPlayers === 1 && !ctx.currentUserId) {
    sendCommandError(ctx, 'A formal solo game requires login', msg.requestId, 'login_required')
    return
  }
  if (maxPlayers === 1 && (setup.hotseat || setup.draft || setup.enableSnakeOpening
    || setup.allowIncompleteFarmersOfTheMoorMinorDeal
    || (input.soloHandMode !== undefined && input.soloHandMode !== 'random' && input.soloHandMode !== 'choose-7'))) {
    sendCommandError(ctx, 'Unsupported standard solo setup', msg.requestId)
    return
  }
  const enableCommunityDeck = setup.enableCommunityDeck
  const customCardDbIds = resolveCustomCardDbIds(input, maxPlayers === 1 || enableCommunityDeck)
  const executionStamp = ctx.authority ? await new ExecutionAccess(ctx.authority.directory.db).capture(customCardDbIds, ctx.currentUserId ? [ctx.currentUserId] : []) : undefined
  const configuration = setup.soloHandMode ? soloCreationConfiguration(setup, customCardDbIds) : undefined
  const soloCards = configuration ? await resolveSoloWorkshopCards(getDb(), configuration) : undefined
  if (soloCards?.issues.length && configuration) {
    sendCommandError(ctx, 'The selected card sources require adjustment', msg.requestId, 'creation_requires_adjustment')
    if (ctx.activeCommand?.outcome) ctx.activeCommand.outcome.creationAdjustment = { configuration, issues: soloCards.issues }
    return
  }
  const loadedCustomCards = soloCards
    ? { cards: soloCards.cards, loadedDbIds: customCardDbIds, hasNotLive: false }
    : await loadCustomCards(customCardDbIds, ctx.currentUserId, { liveOnly: true })
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
    seatOwners: [],
    maxPlayers,
    ...(setup.soloHandMode && configuration ? {
      soloHandMode: setup.soloHandMode,
      creationConfiguration: { configuration, resolvedWorkshopSources: soloCards?.resolvedWorkshopSources ?? [] },
    } : {}),
    ...(msg.sourceGameContextId && ctx.currentUserId ? { creationSource: { roomId: msg.sourceGameContextId, userId: ctx.currentUserId } } : {}),
    version: 0,
    status: 'waiting',
    ...(setup.hotseat ? { hotseat: true } : {}),
    createdBy: ctx.currentUserId,
    access: access.access,
    customCardDbIds: loadedCustomCards.loadedDbIds,
    customCards,
    enableParentCards: setup.enableParentCards,
    draftParents: setup.draftParents,
    draftMode: draftOptions.value?.draftMode,
    draftPoolSize: draftOptions.value?.draftPoolSize,
    enableThroughTheSeasons: setup.enableThroughTheSeasons,
    enableFarmersOfTheMoor: setup.enableFarmersOfTheMoor,
    enableMoorBalanceRules: setup.enableMoorBalanceRules,
    allowIncompleteFarmersOfTheMoorMinorDeal: setup.allowIncompleteFarmersOfTheMoorMinorDeal,
    enableSnakeOpening: setup.enableSnakeOpening,
  }
  ctx.committer?.lockNewRoom(room)

  if (setup.teamConfig) {
    if (!isPrerelease() || !ctx.currentUserId) {
      room.customSessionExecutor?.dispose(); room.session.dispose()
      sendCommandError(ctx, 'Team games require prerelease access', msg.requestId); return
    }
    const account = await getDb().prepare('SELECT display_name FROM users WHERE id=?').get<{ display_name: string }>(ctx.currentUserId)
    const member = admitTeamMember(room, ctx.currentUserId, typeof msg.name === 'string' && msg.name.trim() ? msg.name.trim() : account?.display_name ?? '')
    room.teamMembers = [member]
    room.waitingTeamConnections = new Map([[member.memberId, ctx.ws]])
    try {
      await ctx.checkpoint.recordCreated(room, ctx.activeCommand ? {
        receipt: { request: ctx.activeCommand.request, outcome: { ok: true, roomId, roomVersion: 0 } },
      } : undefined)
    } catch (error) { room.customSessionExecutor?.dispose(); room.session.dispose(); throw error }
    const previous = ctx.currentRoom
    ctx.currentRoom = room; ctx.currentPlayerIndex = -1; ctx.registry.set(room)
    await detachPreviousRoom(ctx, room, previous)
    await broadcastTeamWaiting(ctx, room)
    return
  }
  const creatorSeat = resolveJoinPlayerIndex(room, undefined, ctx.currentUserId)
  if (!creatorSeat.ok) throw new Error(creatorSeat.error)
  const creatorIndex = creatorSeat.playerIndex
  if (ctx.currentUserId) room.seatOwners = [{ playerIndex: creatorIndex, userId: ctx.currentUserId }]
  const name = typeof (msg as Record<string, unknown>).name === 'string'
    ? (msg as Record<string, unknown>).name as string
    : ''
  room.players.push({ ws: ctx.ws, playerIndex: creatorIndex, name, userId: ctx.currentUserId })
  if (room.customSessionExecutor) await room.customSessionExecutor.updatePlayerNames([[creatorIndex, name]])
  else room.session.updatePlayerName(creatorIndex, name)
  const startsImmediately = room.hotseat === true || maxPlayers === 1
  try {
    if (!startsImmediately) await ctx.checkpoint.recordCreated(room, ctx.activeCommand ? {
      receipt: { request: ctx.activeCommand.request, outcome: { ok: true, roomId, roomVersion: 0, playerIndex: creatorIndex } },
    } : undefined)
  } catch (error) {
    room.customSessionExecutor?.dispose()
    room.session.dispose()
    throw error
  }
  let creationCommitted = false
  const confirmCreated = async (): Promise<void> => {
    // Both callers reach this callback only after their durable creation commit.
    creationCommitted = true
    const previous = ctx.currentRoom
    ctx.currentRoom = room
    ctx.currentPlayerIndex = creatorIndex
    ctx.registry.set(room)
    try {
      await detachPreviousRoom(ctx, room, previous)
    } catch (error) {
      console.warn(JSON.stringify({ event: 'previous_room_detach_failed', roomId: room.id, previousRoomId: previous?.id,
        error: error instanceof Error ? error.message : String(error) }))
    }
    await ctx.broadcaster.sendRoomEvent(ctx.ws, room, {
      type: 'roomCreated',
      ...connectionViewerMetadata(room, ctx.ws),
      roomId,
      playerIndex: creatorIndex,
      maxPlayers,
      playerColors: room.session.state.players.map(player => player.color),
      ...(setup.hotseat ? { hotseat: true } : {}),
    })
  }
  // A hotseat room has nobody left to wait for — its creator holds every seat,
  // so it starts as soon as it exists instead of sitting in the waiting room.
  // Its confirmation waits for that first deal: once the client sees
  // `roomCreated` it stops listening for creation errors, so confirming a room
  // that then fails to initialize would strand it in the waiting state.
  if (!startsImmediately) {
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
        sendCommandError(ctx, resp.error ?? 'unable to initialize game', msg.requestId)
        return
      }
      try {
        await publishInitialState(ctx, room, resp, msg.requestId, confirmCreated, async () => {
          await ctx.broadcaster.broadcastEvent(room, { type: 'gameStarted' })
        })
        if (!creationCommitted) {
          await ctx.committer?.retireRoom(room.id)
          room.customSessionExecutor?.dispose()
          room.session.dispose()
        }
      } catch (error) {
        if (!creationCommitted) {
          await ctx.committer?.retireRoom(room.id)
          room.customSessionExecutor?.dispose()
          room.session.dispose()
        }
        throw error
      }
    },
  ))
}

async function handleSpectateRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'spectateRoom' }>): Promise<void> {
  const room = ctx.registry.get(msg.roomId)
  if (!ctx.authenticated || !ctx.currentUserId) {
    sendCommandError(ctx, 'Sign in to spectate', msg.requestId, 'login_required'); return
  }
  if (room && (room.seatOwners?.some(seat => seat.userId === ctx.currentUserId) || room.players.some(seat => seat.userId === ctx.currentUserId))) {
    await handleJoinRoom(ctx, { type: 'joinRoom', roomId: msg.roomId, intent: 'resume', requestId: msg.requestId }); return
  }
  if (!room || !isPublicSpectatableRoom(room) || room.session.state.gameOver || roomConnectedPlayerCount(room) === 0) {
    sendCommandError(ctx, 'This game is not available for spectating', msg.requestId, 'not_participant'); return
  }
  if (ctx.gameContextStore && await ctx.gameContextStore.lifecycle(room.id) !== 'active') {
    sendCommandError(ctx, 'Game context changed', msg.requestId, 'context_changed'); return
  }
  if (ctx.committer?.blockedError(room.id)) {
    sendCommandError(ctx, 'Room saving is paused', msg.requestId); return
  }
  await detachPreviousRoom(ctx, room)
  addRoomSpectator(room, ctx.ws)
  ctx.currentRoom = room
  ctx.broadcaster.sendTo(ctx.ws, { type: 'roomSpectated', roomId: room.id })
  await handleGetState(ctx, { type: 'getState', requestId: msg.requestId })
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
  if (!canAccessRoom(room, ctx.currentUserId)) {
    sendCommandError(ctx, 'Only invited players can enter this room', msg.requestId, ctx.currentUserId ? 'not_participant' : 'login_required', 'active')
    return
  }

  if (room.status === 'waiting' && room.session.state.team) {
    await joinTeamWaiting(ctx, room, msg); return
  }
  const ownsSeat = room.seatOwners?.some(seat => seat.userId === ctx.currentUserId)
    || room.players.some(seat => seat.userId === ctx.currentUserId && !!ctx.currentUserId)
  if (msg.intent === 'join' && !ownsSeat && room.status === 'playing' && isPublicSpectatableRoom(room)) {
    await handleSpectateRoom(ctx, { type: 'spectateRoom', roomId, requestId: msg.requestId }); return
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
  if (msg.intent === 'resume' && !isDevRoom(room.id)) {
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
    if (msg.intent === 'resume' && requestedPlayerIndex === undefined) {
      const ownedSeats = (room.seatOwners ?? []).filter(owner => owner.userId === ctx.currentUserId)
      if (ownedSeats.length !== 1) {
        sendCommandError(ctx, 'choose a player slot to resume this development room', msg.requestId, 'player_slot_required', 'active')
        return
      }
      requestedPlayerIndex = ownedSeats[0]!.playerIndex
    }
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
  const previousColorConfirmationPlayerIndex = room.colorConfirmationPlayerIndex
  const previousPlayerCount = roomOccupiedSeatCount(room)
  const previousStartedAt = room.startedAt
  const previousNames = room.session.state.players.map((player, index) => [index, player.nameIsDefault ? '' : player.name] as [number, string])
  ctx.currentRoom = room
  ctx.currentPlayerIndex = seat.playerIndex
  const requestedName = typeof msg.name === 'string' ? msg.name.trim() : ''
  const currentPlayer = room.session.state.players[ctx.currentPlayerIndex]
  const name = requestedName || (currentPlayer?.nameIsDefault ? '' : currentPlayer?.name ?? '')
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
    room.colorConfirmationPlayerIndex = previousColorConfirmationPlayerIndex
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
  const roomFull = room.hotseat === true || (room.awaitingRematchPlayers ? roomConnectedPlayerCount(room) : playerCount) >= room.maxPlayers
  const starting = !wasPlaying && roomFull && (room.hotseat === true || isDevRoom(room.id))
  if (!wasPlaying && !starting && roomFull
    && (previousPlayerCount < room.maxPlayers || room.colorConfirmationPlayerIndex === undefined)) {
    room.colorConfirmationPlayerIndex = ctx.currentPlayerIndex
  }
  if (starting) {
    room.status = 'playing'
    room.startedAt ??= Date.now()
  }
  const { players } = waitingRoomEvent(room)
  const publishJoin = async (): Promise<void> => {
    await detachPreviousRoom(ctx, room, previousCtxRoom)
    publishSeatReplacement()
    await ctx.broadcaster.sendRoomEvent(ctx.ws, room, {
      type: 'roomJoined',
      ...connectionViewerMetadata(room, ctx.ws),
      roomId,
      playerIndex: ctx.currentPlayerIndex,
      status: room.status === 'waiting' ? 'waiting' : 'playing',
      players,
      maxPlayers: room.maxPlayers,
      playerColors: room.session.state.players.map(player => player.color),
      ...(room.colorConfirmationPlayerIndex === undefined ? {} : { colorConfirmationPlayerIndex: room.colorConfirmationPlayerIndex }),
      ...(room.hotseat ? { hotseat: true } : {}),
    })
    for (const playerIndex of controlledSeatIndexes(room, ctx.ws)) await ctx.broadcaster.broadcastEvent(room, {
      type: 'playerJoined', playerIndex,
      name: room.players.find(player => player.playerIndex === playerIndex)?.name
        ?? room.session.state.players[playerIndex]?.name ?? name,
      playerCount, maxPlayers: room.maxPlayers,
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
    if (!wasPlaying && room.colorConfirmationPlayerIndex !== undefined) {
      await ctx.broadcaster.broadcastEvent(room, waitingRoomEvent(room))
    }
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

async function broadcastTeamWaiting(ctx: ConnectionCtx, room: Room): Promise<void> {
  for (const member of room.teamMembers ?? []) {
    const connection = room.waitingTeamConnections?.get(member.memberId)
    if (connection) await ctx.broadcaster.sendRoomEvent(connection, room, { type: 'teamRoomWaiting', ...teamWaitingState(room, member.userId) })
  }
}

async function joinTeamWaiting(ctx: ConnectionCtx, room: Room, msg: Extract<ClientCommand, { type: 'joinRoom' }>): Promise<void> {
  if (!ctx.currentUserId) { sendCommandError(ctx, 'Sign in to join a Team room', msg.requestId, 'login_required'); return }
  if (msg.intent === 'resume' && !room.teamMembers?.some(member => member.userId === ctx.currentUserId)) {
    sendCommandError(ctx, 'Only original members can resume this Team room', msg.requestId, 'not_participant'); return
  }
  const account = await getDb().prepare('SELECT display_name FROM users WHERE id=?').get<{ display_name: string }>(ctx.currentUserId)
  let member
  try { member = admitTeamMember(room, ctx.currentUserId, msg.name?.trim() || account?.display_name || '') }
  catch (error) { sendCommandError(ctx, error instanceof Error ? error.message : 'Unable to join Team room', msg.requestId); return }
  const previousMembers = room.teamMembers, previousStamp = room.executionStamp
  room.teamMembers = [...(room.teamMembers ?? []).filter(value => value.memberId !== member.memberId), member]
  if (ctx.authority && !room.executionStamp?.some(subject => subject.kind === 'user' && subject.id === member.userId)) {
    room.executionStamp = [...(room.executionStamp ?? []), ...await new ExecutionAccess(ctx.authority.directory.db).capture([], [member.userId])]
  }
  try { await ctx.checkpoint.recordMeta(room, { resume: true }) }
  catch (error) { room.teamMembers = previousMembers; room.executionStamp = previousStamp; throw error }
  const previousRoom = ctx.currentRoom
  const replaced = room.waitingTeamConnections?.get(member.memberId)
  room.waitingTeamConnections ??= new Map()
  room.waitingTeamConnections.set(member.memberId, ctx.ws)
  ctx.currentRoom = room; ctx.currentPlayerIndex = -1
  await detachPreviousRoom(ctx, room, previousRoom)
  if (replaced && replaced !== ctx.ws) replaced.close(4001, 'seat replaced')
  ctx.registry.touchActivity(room.id, Date.now())
  await broadcastTeamWaiting(ctx, room)
}

async function handleSetTeam(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'setTeam' }>): Promise<void> {
  const room = ctx.currentRoom, userId = ctx.currentUserId
  const team = room?.session.state.team
  const self = room?.teamMembers?.find(member => member.userId === userId)
  if (!room || !team || room.status !== 'waiting' || !self || room.waitingTeamConnections?.get(self.memberId) !== ctx.ws) {
    sendCommandError(ctx, 'Team assignments are unavailable', msg.requestId, 'team_change_failed'); return
  }
  const member = room.teamMembers?.find(value => value.memberId === (msg.memberId ?? self.memberId))
  const teamCount = room.maxPlayers / team.configuration.seatsPerTeam
  if (!member || (member.memberId !== self.memberId && room.createdBy !== userId)
    || !Number.isInteger(msg.teamIndex) || msg.teamIndex < 0 || msg.teamIndex >= teamCount
    || (room.teamMembers ?? []).filter(value => value.memberId !== member.memberId && value.teamIndex === msg.teamIndex)
      .reduce((sum, value) => sum + value.seatCount, member.seatCount) > team.configuration.seatsPerTeam) {
    sendCommandError(ctx, 'Invalid Team assignment', msg.requestId, 'team_change_failed'); return
  }
  const previous = room.teamMembers
  room.teamMembers = (previous ?? []).map(value => value.memberId === member.memberId ? { ...value, teamIndex: msg.teamIndex } : value)
  try { await ctx.checkpoint.recordMeta(room) }
  catch (error) { room.teamMembers = previous; throw error }
  if (ctx.activeCommand) ctx.activeCommand.outcome = { ok: true, roomId: room.id, roomVersion: room.version }
  await broadcastTeamWaiting(ctx, room)
}

async function handleStartTeamGame(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'startTeamGame' }>): Promise<void> {
  const room = ctx.currentRoom, team = room?.session.state.team
  if (!room || !team || room.status !== 'waiting' || room.createdBy !== ctx.currentUserId
    || !room.teamMembers?.some(member => member.userId === ctx.currentUserId && room.waitingTeamConnections?.get(member.memberId) === ctx.ws)) {
    sendCommandError(ctx, 'Only the host can start a waiting Team game', msg.requestId, 'team_start_failed'); return
  }
  let seating
  try { seating = planTeamSeating(team, room.teamMembers, room.session.state.gameSeed) }
  catch (error) { sendCommandError(ctx, error instanceof Error ? error.message : 'Team room is incomplete', msg.requestId, 'team_start_failed'); return }
  const previousPlayers = room.players, previousOwners = room.seatOwners, previousStartedAt = room.startedAt
  const names = seating.map(member => [member.playerIndex, member.name] satisfies [number, string])
  room.seatOwners = seating.map(({ playerIndex, userId }) => ({ playerIndex, userId }))
  room.players = (room.teamMembers ?? []).flatMap(member => {
    const ws = room.waitingTeamConnections?.get(member.memberId)
    const primary = seating.find(seat => seat.memberId === member.memberId)
    return ws && primary ? [{ ws, playerIndex: primary.playerIndex, name: member.name, userId: member.userId }] : []
  }).sort((left, right) => left.playerIndex - right.playerIndex)
  room.status = 'playing'; room.startedAt = Date.now()
  try {
    if (room.customSessionExecutor) await room.customSessionExecutor.updatePlayerNames(names)
    else for (const [index, name] of names) room.session.updatePlayerName(index, name)
    const resp = await executeRoomSession(room, 'getState', [], () => room.session.getState())
    if (!resp.ok) throw new Error(resp.error ?? 'Unable to initialize Team game')
    await publishInitialState(ctx, room, resp, msg.requestId, async () => {
      for (const member of room.teamMembers ?? []) {
        const ws = room.waitingTeamConnections?.get(member.memberId)
        const primary = seating.find(seat => seat.memberId === member.memberId)
        if (!ws || !primary) continue
        await ctx.broadcaster.sendRoomEvent(ws, room, { type: 'roomJoined', roomId: room.id, playerIndex: primary.playerIndex,
          ...connectionViewerMetadata(room, ws), status: 'playing', maxPlayers: room.maxPlayers,
          players: waitingRoomEvent(room).players, playerColors: room.session.state.players.map(player => player.color) })
      }
      room.waitingTeamConnections = undefined
    }, async () => { await ctx.broadcaster.broadcastEvent(room, { type: 'gameStarted' }) })
  } catch (error) {
    if (!ctx.committer?.hasReplay(room.id)) {
      room.players = previousPlayers; room.seatOwners = previousOwners; room.status = 'waiting'; room.startedAt = previousStartedAt
    }
    throw error
  }
}

async function handleSetPlayerColor(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'setPlayerColor' }>): Promise<void> {
  const room = requireRoom(ctx, msg.requestId)
  if (!room) return
  if (room.status !== 'waiting') {
    sendCommandError(ctx, 'Colors are locked after the game starts', msg.requestId, 'color_locked')
    return
  }
  if (!playerColorOptions.includes(msg.color)) {
    sendCommandError(ctx, 'Invalid player color', msg.requestId, 'invalid_color')
    return
  }
  const occupied = new Set([...room.players, ...(room.seatOwners ?? [])].map(player => player.playerIndex))
  const colorIndex = room.session.state.players.findIndex(player => player.color === msg.color)
  if (colorIndex !== ctx.currentPlayerIndex && occupied.has(colorIndex)) {
    sendCommandError(ctx, 'Another player already chose this color', msg.requestId, 'color_unavailable')
    return
  }
  const previous = room.session.state.players.map((player, index): [number, typeof player.color] => [index, player.color])
  const colors: Parameters<Room['session']['updatePlayerColors']>[0] = [[ctx.currentPlayerIndex, msg.color]]
  if (colorIndex >= 0 && colorIndex !== ctx.currentPlayerIndex) colors.push([colorIndex, room.session.state.players[ctx.currentPlayerIndex]!.color])
  const update = async (next: typeof colors): Promise<void> => {
    if (room.customSessionExecutor) {
      const response = await room.customSessionExecutor.updatePlayerColors(next)
      if (!response.ok) throw new Error(response.error ?? 'Unable to update colors')
    } else room.session.updatePlayerColors(next)
  }
  try {
    const blocked = ctx.committer?.blockedError(room.id)
    if (blocked) throw new Error(blocked)
    await update(colors)
    await ctx.checkpoint.recordMeta(room, ctx.activeCommand ? { receipt: {
      request: ctx.activeCommand.request,
      outcome: { ok: true, roomId: room.id, roomVersion: room.version, playerIndex: ctx.currentPlayerIndex },
    } } : undefined)
  } catch {
    await update(previous)
    sendCommandError(ctx, 'Could not save the selected color', msg.requestId, 'color_save_failed')
    return
  }
  await ctx.broadcaster.broadcastEvent(room, waitingRoomEvent(room))
}

async function handleConfirmPlayerColor(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'confirmPlayerColor' }>): Promise<void> {
  const room = requireRoom(ctx, msg.requestId)
  if (!room) return
  if (room.status !== 'waiting') {
    sendCommandError(ctx, 'Colors are locked after the game starts', msg.requestId, 'color_locked')
    return
  }
  if (room.colorConfirmationPlayerIndex !== ctx.currentPlayerIndex || (room.awaitingRematchPlayers ? roomConnectedPlayerCount(room) : roomOccupiedSeatCount(room)) < room.maxPlayers) {
    sendCommandError(ctx, 'The final arriving player must confirm their color', msg.requestId, 'color_confirmation_unavailable')
    return
  }
  let response: SessionResponse
  try {
    const blocked = ctx.committer?.blockedError(room.id)
    if (blocked) throw new Error(blocked)
    response = await executeRoomSession(room, 'getState', [], () => room.session.getState())
    if (!response.ok) throw new Error(response.error ?? 'Unable to initialize game')
  } catch (error) {
    sendCommandError(ctx, error instanceof Error ? error.message : 'Could not start the game; please try again', msg.requestId, 'color_confirmation_failed')
    return
  }
  room.status = 'playing'
  room.startedAt ??= Date.now()
  room.colorConfirmationPlayerIndex = undefined
  room.awaitingRematchPlayers = false
  await publishInitialState(ctx, room, response, msg.requestId, () => {}, async () => {
    await ctx.broadcaster.broadcastEvent(room, { type: 'gameStarted' })
  })
}

async function handleGetGameEndProposal(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'getGameEndProposal' }>): Promise<void> {
  const room = requireRoom(ctx, msg.requestId)
  if (room) await ctx.broadcaster.sendRoomEvent(ctx.ws, room, { type: 'gameEndProposal', roomId: room.id, proposal: room.endProposal ?? null })
}

async function updateGameEndProposal(ctx: ConnectionCtx, room: Room, proposal: GameEndProposal | null, requestId?: string): Promise<void> {
  const previous = room.endProposal
  const previousRoomId = room.id
  let terminated = false
  room.endProposal = proposal
  const receipt = ctx.activeCommand ? { request: ctx.activeCommand.request, outcome: { ok: true, roomId: room.id } } : undefined
  try {
    if (proposal && hasUnanimousAgreement(proposal)) {
      const termination = buildGameTermination(room, proposal)
      if (proposal.intent === 'rematch') {
        const id = room.id
        await handleNewGame(ctx, { type: 'newGame', requestId }, termination)
        if (room.id === id) room.endProposal = previous
      } else {
        await ctx.checkpoint.terminateRoom(room, termination, { receipt })
        terminated = true
        await ctx.committer?.retireRoom(room.id)
        try {
          if (receipt) ctx.broadcaster.sendTo(ctx.ws, { type: 'commandReceipt', status: 'completed', requestId,
            receipt: { scopeId: receipt.request.scopeId, commandId: receipt.request.commandId, outcome: receipt.outcome } })
          await ctx.broadcaster.broadcastEvent(room, { type: 'gameTerminated', roomId: room.id })
        } finally {
          ctx.broadcaster.endSpectating(room, 'terminated')
          ctx.registry.delete(room.id)
          ctx.registry.clearActivity(room.id)
          for (const player of room.players) player.ws.close()
          room.players = []
          room.session.dispose()
          ctx.currentRoom = null
        }
      }
      return
    }
    await ctx.checkpoint.recordMeta(room, { receipt })
  } catch (error) {
    if (terminated || room.id !== previousRoomId) throw error
    room.endProposal = previous
    if (error instanceof RoomOwnershipError) throw error
    sendCommandError(ctx, error instanceof Error ? error.message : 'Could not save the end proposal', requestId)
    return
  }
  await ctx.broadcaster.broadcastEvent(room, { type: 'gameEndProposal', roomId: room.id, proposal })
}

async function handleProposeGameEnd(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'proposeGameEnd' }>): Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId)
  if (!room) return
  if (msg.intent !== 'end' && msg.intent !== 'rematch') { sendCommandError(ctx, 'Invalid end intent', msg.requestId); return }
  let proposal: GameEndProposal
  try { proposal = createGameEndProposal(room, ctx.currentPlayerIndex, msg.intent, ctx.controlledPlayerIndices) }
  catch (error) { sendCommandError(ctx, error instanceof Error ? error.message : 'Invalid end proposal', msg.requestId); return }
  await updateGameEndProposal(ctx, room, proposal, msg.requestId)
}

async function handleRespondGameEnd(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'respondGameEnd' }>): Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId)
  if (!room) return
  const proposal = room.endProposal
  if (!proposal || proposal.id !== msg.proposalId || typeof msg.agree !== 'boolean') { sendCommandError(ctx, 'End proposal is no longer pending', msg.requestId); return }
  await updateGameEndProposal(ctx, room, msg.agree ? agreeToGameEnd(proposal, ctx.controlledPlayerIndices) : null, msg.requestId)
}

async function handleWithdrawGameEnd(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'withdrawGameEnd' }>): Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId)
  if (!room) return
  if (!room.endProposal || room.endProposal.id !== msg.proposalId || !ctx.controlledPlayerIndices.has(room.endProposal.proposerIndex)) {
    sendCommandError(ctx, 'Only the proposer can withdraw this proposal', msg.requestId); return
  }
  await updateGameEndProposal(ctx, room, null, msg.requestId)
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
  const room = requireReadableRoom(ctx, msg.requestId); if (!room) return
  const blocked = ctx.committer?.blockedError(room.id)
  if (blocked) { sendCommandError(ctx, `room saving is paused: ${blocked}`, msg.requestId); return }
  if (msg.cursor !== undefined && (typeof msg.cursor !== 'string' || msg.cursor.length > 1024)) {
    sendCommandError(ctx, 'invalid history cursor', msg.requestId); return
  }
  try {
    const canonical = room.customSessionExecutor?.serializedStateForPersistence()?.frame
      ?? room.session.withCtx(() => serializeState(room.session.state, { actionHooks: room.session.actionHooks }))
    const page = buildRoomHistoryPage(withRoomParticipantNames(room, canonical), visiblePlayerIdsForConnection(room, ctx.ws), msg.cursor)
    await ctx.broadcaster.sendRoomEvent(ctx.ws, room, { type: 'historyPage', roomId: room.id, requestId: msg.requestId, page })
  } catch (error) {
    sendCommandError(ctx, error instanceof Error ? error.message : String(error), msg.requestId, error instanceof HistoryProjectionChangedError ? 'history_projection_changed' : error instanceof HistoryBranchChangedError ? 'history_branch_changed' : undefined)
  }
}

async function handleFenceQuote(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'quoteFenceSelection' }>): Promise<void> {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  const blocked = ctx.committer?.blockedError(room.id)
  if (blocked) { sendCommandError(ctx, `room saving is paused: ${blocked}`, msg.requestId); return }
  if (msg.expectedVersion !== room.version) {
    sendCommandError(ctx, 'Fence quote is stale', msg.requestId); return
  }
  try {
    const quote = room.customSessionExecutor
      ? await room.customSessionExecutor.query<FenceSelectionQuote>('quoteFenceSelection', [msg.playerIndex, msg.requestKey, msg.payload])
      : room.session.quoteFenceSelection(msg.playerIndex, msg.requestKey, msg.payload)
    await ctx.broadcaster.sendRoomEvent(ctx.ws, room, {
      type: 'fenceSelectionQuote', roomId: room.id, version: room.version, requestId: msg.requestId, quote,
    })
  } catch (error) {
    sendCommandError(ctx, error instanceof Error ? error.message : String(error), msg.requestId)
  }
}

function handleGetState(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'getState' }>): void | Promise<void> {
  const room = requireReadableRoom(ctx, msg.requestId); if (!room) return
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
  const seat = actingSeat(ctx, room, msg.requestId); if (seat === null) return
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
  const seat = actingSeat(ctx, room, msg.requestId); if (seat === null) return
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
  const seat = actingSeat(ctx, room, msg.requestId); if (seat === null) return
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
  const seat = actingSeat(ctx, room, msg.requestId); if (seat === null) return
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
  const seat = msg.playerIndex
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
  let payload
  try { payload = parseCommitSelectionPayload(msg.payload) } catch (error) {
    sendCommandError(ctx, error instanceof Error ? error.message : String(error), msg.requestId); return
  }
  const seat = msg.playerIndex
  return useSessionResponse(
    executeRoomSession(
      room,
      'commitSelectionChoice',
      [seat, payload],
      () => room.session.commitSelectionChoice(seat, payload),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'choice', seat),
  )
}

function handleSoloHandSubmit(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'soloHandSubmit' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  const seat = msg.playerIndex
  return useSessionResponse(
    executeRoomSession(room, 'submitSoloHandSelection', [seat, msg.selection],
      () => room.session.submitSoloHandSelection(seat, msg.selection)),
    resp => publishCommandResponse(ctx, room, resp, msg, 'choice', seat),
  )
}

function handleParentSubmit(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'parentSubmit' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  const seat = msg.playerIndex
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
  if (!assertMayUndo(ctx, room, msg.requestId)) return
  const seat = waitingSeat(room)
  return useSessionResponse(
    executeRoomSession(room, 'undoStep', [], () => room.session.undoStep()),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'undo', seat),
  )
}

function handleUndoAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'undoAction' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertMayUndo(ctx, room, msg.requestId)) return
  const seat = waitingSeat(room)
  return useSessionResponse(
    executeRoomSession(room, 'undoAction', [], () => room.session.undoAction()),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'undo', seat),
  )
}

async function handleNewGame(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'newGame' }>, termination?: GameTermination): Promise<Awaited<void | Promise<void>>> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!termination && room.status === 'playing' && !room.session.state.gameOver && !isDevRoom(room.id)) {
    await handleProposeGameEnd(ctx, { type: 'proposeGameEnd', intent: 'rematch', requestId: msg.requestId })
    return
  }
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
  const soloConfiguration = room.creationConfiguration?.configuration
  const soloCards = soloConfiguration ? await resolveSoloWorkshopCards(getDb(), soloConfiguration) : undefined
  if (soloCards?.issues.length && soloConfiguration) {
    sendCommandError(ctx, 'The selected card sources require adjustment', msg.requestId, 'creation_requires_adjustment')
    if (ctx.activeCommand?.outcome) ctx.activeCommand.outcome.creationAdjustment = { configuration: soloConfiguration, issues: soloCards.issues }
    return
  }
  const reloaded = soloCards && soloConfiguration
    ? { cards: soloCards.cards, loadedDbIds: soloConfiguration.customCardIds, hasNotLive: false }
    : (await loadCustomCards(
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
  const enableMoorBalanceRules = enableFarmersOfTheMoor && room.session.state.enableMoorBalanceRules === true
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
        ...(room.session.state.team ? { teamConfig: room.session.state.team.configuration, teamAssignments: room.session.state.team.playerTeams } : {}),
        ...(room.soloHandMode ? { soloHandMode: room.soloHandMode } : {}),
        enableCommunityDeck,
        enableParentCards,
        ...(room.draftParents === false ? { draftParents: false } : {}),
        ...(draftMode === 'simultaneous'
          ? { draftMode, draftPoolSize: draftPoolSize ?? 7 }
          : {}),
        enableThroughTheSeasons,
        enableFarmersOfTheMoor,
        enableMoorBalanceRules,
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
  const nextRoomId = termination && room.endProposal?.intent === 'rematch'
    ? room.endProposal.nextRoomId
    : ctx.activeCommand?.request.resultRoomId ?? (await generateRoomId(ctx, fixedDevRoomRootId(previousRoomId)))
  if (!nextRoomId) {
    created.executor?.dispose()
    created.session.dispose()
    sendCommandError(ctx, 'unable to allocate room id', msg.requestId)
    return
  }
  const nextPlayers: Room['players'] = []
  const nextOwners: NonNullable<Room['seatOwners']> = []
  const names: Array<[number, string]> = []
  const colorsBySeat = new Map<number, typeof room.session.state.players[number]['color']>()
  const originalOwners = toRoomMeta(room).players
  const teamMembers = room.teamMembers?.map(member => ({ ...member,
    name: room.players.find(player => player.userId === member.userId)?.name ?? member.name,
  }))
  const waitingTeamConnections: NonNullable<Room['waitingTeamConnections']> = new Map()
  for (const member of teamMembers ?? []) {
    const connected = room.players.find(player => player.userId === member.userId && player.ws.readyState === player.ws.OPEN)
    if (connected) waitingTeamConnections.set(member.memberId, connected.ws)
  }
  const startsTeamImmediately = teamMembers?.every(member => waitingTeamConnections.has(member.memberId)) === true
  if (teamMembers && startsTeamImmediately && created.session.state.team) {
    const bindings = planTeamSeating(created.session.state.team, teamMembers, created.session.state.gameSeed)
    for (const member of teamMembers) {
      const ownBindings = bindings.filter(binding => binding.memberId === member.memberId)
      const originalColors = originalOwners.filter(owner => owner.userId === member.userId)
        .sort((left, right) => left.playerIndex - right.playerIndex)
        .map(owner => room.session.state.players[owner.playerIndex]!.color)
      for (const [index, binding] of ownBindings.entries()) {
        nextOwners.push({ playerIndex: binding.playerIndex, userId: member.userId })
        names.push([binding.playerIndex, member.name])
        const color = originalColors[index]
        if (color) colorsBySeat.set(binding.playerIndex, color)
      }
      const primary = ownBindings[0]!
      nextPlayers.push({ ws: waitingTeamConnections.get(member.memberId)!, playerIndex: primary.playerIndex, name: member.name, userId: member.userId })
    }
    waitingTeamConnections.clear()
  }
  const sourceIndices = termination
    ? room.session.state.players.map((_, index) => index)
    : room.players.map(player => player.playerIndex)
  for (const originalIndex of teamMembers ? [] : sourceIndices) {
    const original = room.session.state.players[originalIndex]!
    const connected = room.players.find(player => player.playerIndex === originalIndex)
    const userId = originalOwners.find(owner => owner.playerIndex === originalIndex)?.userId
    const seat = resolveJoinPlayerIndex({ ...room, id: nextRoomId, players: nextPlayers, seatOwners: nextOwners },
      isDevRoom(nextRoomId) || room.hotseat ? originalIndex : undefined, userId)
    if (!seat.ok) throw new Error(seat.error)
    if (connected) nextPlayers.push({ ...connected, playerIndex: seat.playerIndex })
    if (userId) nextOwners.push({ userId, playerIndex: seat.playerIndex })
    names.push([seat.playerIndex, connected?.name ?? (original.nameIsDefault ? '' : original.name)])
    colorsBySeat.set(seat.playerIndex, original.color)
  }
  nextPlayers.sort((left, right) => left.playerIndex - right.playerIndex)
  nextOwners.sort((left, right) => left.playerIndex - right.playerIndex)
  const unusedColors = playerColorOptions.filter(color => ![...colorsBySeat.values()].includes(color))
  const colors: Parameters<Room['session']['updatePlayerColors']>[0] = created.session.state.players.map((_, index) =>
    [index, colorsBySeat.get(index) ?? unusedColors.shift()!])
  if (created.executor) await created.executor.updatePlayerColors(colors)
  else created.session.updatePlayerColors(colors)
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
        players: nextPlayers,
        version: 0,
        endProposal: null,
        awaitingRematchPlayers: !teamMembers && !!termination && nextPlayers.length < room.maxPlayers,
        ...(teamMembers ? { teamMembers, waitingTeamConnections } : {}),
        creationSource: undefined,
        ...(soloCards && soloConfiguration ? { creationConfiguration: {
          configuration: soloConfiguration, resolvedWorkshopSources: soloCards.resolvedWorkshopSources,
        } } : {}),
        seatOwners: nextOwners,
        status: teamMembers ? startsTeamImmediately ? 'playing' : 'waiting'
          : isDevRoom(nextRoomId) || room.hotseat === true || room.players.length >= room.maxPlayers ? 'playing' : 'waiting',
        colorConfirmationPlayerIndex: undefined,
        enableParentCards, draftMode, draftPoolSize, enableThroughTheSeasons,
        enableFarmersOfTheMoor, enableMoorBalanceRules, allowIncompleteFarmersOfTheMoorMinorDeal, enableSnakeOpening,
        customCardDbIds: reloaded.loadedDbIds, customCards,
      }
      nextRoom.startedAt = nextRoom.status === 'playing' ? Date.now() : undefined
      ctx.committer!.lockNewRoom(nextRoom)
      const adopt = async (): Promise<void> => {
        ctx.broadcaster.endSpectating(room, termination ? 'terminated' : room.session.state.gameOver ? 'completed' : 'removed')
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
        for (const player of room.players) {
          await ctx.broadcaster.sendRoomEvent(player.ws, room, {
            type: 'roomJoined', roomId: room.id, playerIndex: player.playerIndex, ...connectionViewerMetadata(room, player.ws),
            status: room.status === 'waiting' ? 'waiting' : 'playing', maxPlayers: room.maxPlayers,
            players: teamMembers ? room.session.state.players.map((seat, playerIndex) => ({ playerIndex, name: seat.name,
              connected: connectedSeatIndexes(room).includes(playerIndex) }))
              : room.players.map(seat => ({ playerIndex: seat.playerIndex, name: seat.name, connected: true })),
            playerColors: room.session.state.players.map(seat => seat.color),
            ...(room.hotseat ? { hotseat: true } : {}),
          })
        }
      }
      if (nextRoom.status === 'playing') {
        return publishInitialState(ctx, nextRoom, resp, msg.requestId, adopt, () => {}, previousRoomId, previousOwner, previousVersion, termination)
      }
      await ctx.checkpoint.recordCreated(nextRoom, {
        retireRoomId: previousRoomId,
        retiredOwner: previousOwner,
        retiredVersion: previousVersion,
        retiredTermination: termination,
        ...(ctx.activeCommand ? { receipt: { request: ctx.activeCommand.request, outcome: { ok: true, roomId: nextRoomId, roomVersion: 0,
          ...(teamMembers ? {} : { playerIndex: nextPlayers.find(player => player.ws === ctx.ws)!.playerIndex }) } } } : {}),
      })
      await adopt()
      if (teamMembers) { await broadcastTeamWaiting(ctx, room); return }
      await ctx.broadcaster.broadcastEvent(room, waitingRoomEvent(room))
      await ctx.broadcaster.broadcastCommitted(room, resp, 'reconnect', msg.requestId)
    },
  ))
}

async function handleLoadGame(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'loadGame' }>): Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  // Replacing the authoritative state is a dev command like the others below.
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  try { assertSupportedLoadedState(msg.state) }
  catch (error) { sendCommandError(ctx, error instanceof Error ? error.message : 'Unsupported game configuration', msg.requestId); return }
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
  const draftSeat = room.session.state.players.findIndex((player) => player.id === msg.playerId)
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
  setTeam: handleSetTeam,
  startTeamGame: handleStartTeamGame,
  joinRoom: handleJoinRoom,
  spectateRoom: handleSpectateRoom,
  dissolveRoom: handleDissolveRoom,
  proposeGameEnd: handleProposeGameEnd,
  respondGameEnd: handleRespondGameEnd,
  withdrawGameEnd: handleWithdrawGameEnd,
  getGameEndProposal: handleGetGameEndProposal,
  setPlayerColor: handleSetPlayerColor,
  confirmPlayerColor: handleConfirmPlayerColor,
  getState: handleGetState,
  getHistory: handleGetHistory,
  quoteFenceSelection: handleFenceQuote,
  action: handleAction,
  specialAction: handleSpecialAction,
  choice: handleChoice,
  anytime: handleAnytime,
  ordinaryDrawKeep: handleOrdinaryDrawKeep,
  roundEnd: handleRoundEnd,
  commitSelection: handleCommitSelection,
  parentSubmit: handleParentSubmit,
  soloHandSubmit: handleSoloHandSubmit,
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
  if (isPrerelease() && (msg.type === 'auth' || !(await prereleaseCommandAllowed(ctx.ws)))) { closePrereleaseSocket(ctx.ws); return }
  const run = () => observeCommand({ command: msg.type, requestId: msg.requestId, socket: ctx.ws, round: roundTag(ctx.currentRoom?.session.state) }, () => dispatchCommand(ctx, msg))
  const ids = ctx.currentRoom ? [ctx.currentRoom.id] : []
  if (msg.type === 'joinRoom' || msg.type === 'spectateRoom') ids.push(msg.roomId)
  return ctx.authority ? ctx.authority.withRooms(ids, run) : run()
}
async function dispatchCommand(ctx: ConnectionCtx, msg: ClientCommand): Promise<void> {
  refreshConnectionSeat(ctx)
  if (!isPrerelease() && (msg.type === 'setTeam' || msg.type === 'startTeamGame')) {
    sendCommandError(ctx, `unknown command: ${msg.type}`, msg.requestId); return
  }
  if (msg.type === 'createRoom') {
    try {
      if (msg.teamConfig && !isPrerelease()) throw new Error('Unsupported game configuration')
      assertSupportedGameConfiguration(msg)
    }
    catch (error) { sendCommandError(ctx, error instanceof Error ? error.message : 'Unsupported game configuration', msg.requestId); return }
  }
  if (msg.type === 'joinRoom' && ctx.authority) {
    const db = ctx.authority.directory.db
    // Only a signed-in non-participant can spectate; everyone else loads the Room to take a seat.
    const participant = !ctx.currentUserId || await db.prepare('SELECT 1 FROM room_players WHERE room_id=? AND user_id=?').get(msg.roomId, ctx.currentUserId)
    const playing = !participant && !isDevRoom(msg.roomId)
      && await db.prepare("SELECT 1 FROM rooms WHERE id=? AND status='playing'").get(msg.roomId)
    if (!playing) await ctx.authority.load(msg.roomId)
  }
  const fn = handlers[msg.type] as Handler | undefined
  if (!fn) { sendCommandError(ctx, `unknown command: ${msg.type}`, msg.requestId); return }
  refreshConnectionSeat(ctx)
  const acceptedRoom = ctx.currentRoom
  const acceptedRoomId = acceptedRoom?.id
  const acceptedSession = acceptedRoom?.session
  const acceptedPlayerIndex = ctx.currentPlayerIndex
  const room = msg.type === 'joinRoom' || msg.type === 'spectateRoom' ? ctx.registry.get(msg.roomId) : acceptedRoom
  // A move touches both rooms. Reserve all affected queues together before
  // awaiting any work, so two opposite moves cannot deadlock or pass a commit.
  const queuedRooms = [...new Set([acceptedRoom, room].filter((value): value is Room => !!value))]
  const run = async (): Promise<void> => {
    refreshConnectionSeat(ctx)
    const endPreflight = startObservation('preflight')
    let request: CommandRequest | undefined
    const commands = ctx.commands
    try {
      if (!(await prereleaseCommandAllowed(ctx.ws))) { commandOutcome('canceled'); closePrereleaseSocket(ctx.ws); return }
      if (ctx.sessionToken && !(await validateSession(ctx.sessionToken))) { commandOutcome('canceled'); if (isPrerelease()) closePrereleaseSocket(ctx.ws); else ctx.ws.close(1008, 'session revoked'); return }
      if (isRoomSpectator(ctx.currentRoom, ctx.ws) && !['auth', 'joinRoom', 'spectateRoom', 'getState', 'getHistory', 'getCommandScope', 'getCommandReceipt'].includes(msg.type)) {
        sendCommandError(ctx, 'Spectators cannot issue game commands', msg.requestId); return
      }
      const writes = !['auth', 'joinRoom', 'spectateRoom', 'getState', 'getHistory', 'quoteFenceSelection', 'getCommandScope', 'getCommandReceipt', 'getGameEndProposal'].includes(msg.type)
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
          const currentRoom = ctx.currentRoom
          if (currentRoom && currentRoom.id === reservation.receipt.outcome.roomId) {
            if (currentRoom.status === 'waiting') {
              if (currentRoom.session.state.team) await broadcastTeamWaiting(ctx, currentRoom)
              else await ctx.broadcaster.sendRoomEvent(ctx.ws, currentRoom, waitingRoomEvent(currentRoom))
            }
            else await handleGetState(ctx, { type: 'getState', requestId: msg.requestId })
          }
          return
        }
        request = reservation.request
        ctx.activeCommand = { request, owner }
        if (msg.type !== 'createRoom') {
          if (!targetRoomId || ctx.currentRoom?.id !== targetRoomId) throw new CommandError('command_input_stale', 'Resume the original room before retrying this command')
          assertCommandInput(msg.type, msg.commandContext, ctx.currentRoom.version, ctx.currentRoom.inputWindow)
        }
      }
      // Creation authorizes its actor, allocation and source independently of
      // whichever completed rules session this connection previously displayed.
      if (ctx.currentRoom && !['auth', 'getCommandScope', 'getCommandReceipt', 'createRoom', 'getGameEndProposal'].includes(msg.type)) await ctx.authority?.assert(ctx.currentRoom)
      if (msg.type === 'joinRoom' || msg.type === 'spectateRoom') { const joined = ctx.registry.get(msg.roomId); if (joined) await ctx.authority?.assert(joined) }
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
      if (error instanceof ExecutionRevokedError) { commandOutcome('canceled'); if (isPrerelease()) closePrereleaseSocket(ctx.ws); else ctx.ws.close(1008, error.message); return }
      if (error instanceof RoomOwnershipError) { commandOutcome('stale'); ctx.ws.close(1012, 'room owner changed'); return }
      commandOutcome(error instanceof CommandError ? error.code === 'command_input_stale' ? 'stale' : 'rule_rejected' : 'error')
      if (!(error instanceof CommandError)) throw error
      sendCommandError(ctx, error.message, msg.requestId, error.code)
      if (error instanceof GameCreationError && error.adjustment && ctx.activeCommand?.outcome) {
        ctx.activeCommand.outcome.creationAdjustment = error.adjustment
      }
    } finally {
      endPreflight()
      refreshConnectionSeat(ctx)
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
          if (active?.outcome && !active.outcome.ok) sendCommandError(ctx, active.outcome.error ?? 'Command rejected', msg.requestId, active.outcome.code as CommandErrorCode | undefined, undefined)
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
  const finish = async () => {
    await waitForConnection(ctx)
    const room = ctx.currentRoom
    if (!room) { await work(); return }
    const queued = () => enqueueRoomTask(room, work)
    if (ctx.authority) await ctx.authority.withRooms([room.id], queued)
    else await queued()
  }
  if (ctx.authority) await ctx.authority.withRooms(ctx.currentRoom ? [ctx.currentRoom.id] : [], finish)
  else await finish()
}
