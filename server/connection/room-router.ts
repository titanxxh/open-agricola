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
  type RoomCommitResult,
} from '../game/room-committer.ts'
import {
  createIsolatedGameSession,
  type CustomSessionMethod,
} from '../game/custom-session-executor.ts'

const DRAFT_POOL_SIZE_DEFAULT = 7
const DRAFT_POOL_SIZE_MIN = 7
const DRAFT_POOL_SIZE_MAX = 10
const MAX_ORDINARY_ROOMS = 30
const customRoomQueues = new WeakMap<Room, Promise<void>>()
const connectionQueues = new WeakMap<ConnectionCtx, Promise<void>>()

const trackQueue = <K extends object>(
  queues: WeakMap<K, Promise<void>>,
  key: K,
  result: Promise<void>,
): void => {
  const tail = result.then(() => undefined, () => undefined)
  queues.set(key, tail)
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })
}

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

const loadCustomCards = (
  cardDbIds: string[],
  requestUserId?: string,
  opts?: { liveOnly?: boolean },
): { cards: CustomCardData[]; hasNotLive: boolean; loadedDbIds: string[] } => {
  if (!cardDbIds.length) return { cards: [], hasNotLive: false, loadedDbIds: [] }
  const db = getDb()
  const result: CustomCardData[] = []
  const loadedDbIds: string[] = []
  let hasNotLive = false
  for (const dbId of cardDbIds) {
    const row = db.prepare(
      'SELECT card_type, card_json, code_manifest, art_url, review_status, live, built_in, author_id FROM workshop_cards WHERE id = ?',
    ).get(dbId) as {
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
        result.push(workshopDraftToCustomCard(loadLiveDraft(db, dbId)))
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

export const loadCustomCardsFromDb = (
  cardDbIds: string[],
  requestUserId?: string,
): CustomCardData[] => loadCustomCards(cardDbIds, requestUserId, { liveOnly: true }).cards

const generateRoomId = (ctx: ConnectionCtx, devRoomRootId?: string | null): string | null => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const generatedId = randomUUID()
    const roomId = devRoomRootId ? `${devRoomRootId}-${generatedId}` : generatedId
    if (!ctx.registry.has(roomId) && !ctx.checkpoint.hasRoomId(roomId)) return roomId
  }
  return null
}

const sendCommandError = (
  ctx: ConnectionCtx,
  error: string,
  requestId?: string,
  code?: GameContextErrorCode | 'seat_replaced',
  lifecycle?: GameContextLifecycle,
) => {
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
  const blocked = ctx.committer?.blockedError(room.id)
  if (!blocked) return room
  sendCommandError(ctx, `room saving is paused: ${blocked}`, requestId)
  return null
}

const notifyPersistencePaused = (ctx: ConnectionCtx, room: Room): void => {
  ctx.broadcaster.broadcastEvent(room, {
    type: 'roomPersistencePaused',
    roomId: room.id,
  })
}

const publishCommandResponse = (
  ctx: ConnectionCtx,
  room: Room,
  response: SessionResponse,
  command: ClientCommand,
  cause: StateUpdateCause,
): void | Promise<void> => {
  if (!response.ok) {
    ctx.broadcaster.sendStateTo(ctx.ws, room, response, command.requestId, cause)
    return
  }
  const replayIntent = replayIntentFromCommand(command)
  if (!ctx.committer || !ctx.committer.isRecording(room.id) || !replayIntent) {
    ctx.broadcaster.broadcastState(room, response, cause, command.requestId)
    return
  }
  const publishCommitted = (): void => {
    if (response.state.gameOver) ctx.checkpoint.markInactive(room.id)
    ctx.broadcaster.broadcastCommitted(room, response, cause, command.requestId)
  }
  const result = ctx.committer.commit(
    room,
    response,
    replayIntent,
    ctx.currentPlayerIndex,
    () => {
      publishCommitted()
      ctx.broadcaster.broadcastEvent(room, {
        type: 'roomPersistenceResumed',
        roomId: room.id,
      })
    },
  )
  if (result.kind === 'committed') {
    publishCommitted()
  } else if (result.kind === 'unchanged') {
    ctx.broadcaster.sendStateTo(ctx.ws, room, response, command.requestId, cause)
  } else {
    notifyPersistencePaused(ctx, room)
    if (!ctx.committer.isRetrying(room.id)) {
      sendCommandError(ctx, result.error, command.requestId)
      return
    }
    return new Promise((resolve) => {
      if (!ctx.committer?.waitUntilReady(room.id, () => resolve())) resolve()
    })
  }
}

const publishInitialState = (
  ctx: ConnectionCtx,
  room: Room,
  response: SessionResponse,
  requestId: string | undefined,
  beforePublish: () => void,
  onReady: () => void,
): void | Promise<void> => {
  const publishReady = (result: Exclude<RoomCommitResult, { kind: 'blocked' }>): void => {
    if (ctx.committer?.hasReplay(room.id)) ctx.checkpoint.markInactive(room.id)
    beforePublish()
    if (result.kind === 'committed') {
      ctx.broadcaster.broadcastCommitted(room, response, 'reconnect', requestId)
    } else {
      ctx.broadcaster.broadcastState(room, response, 'reconnect', requestId)
    }
    ctx.broadcaster.broadcastEvent(room, {
      type: 'roomPersistenceResumed',
      roomId: room.id,
    })
    onReady()
  }
  if (!ctx.committer) {
    beforePublish()
    ctx.broadcaster.broadcastState(room, response, 'reconnect', requestId)
    onReady()
    return
  }
  const result = ctx.committer.prepareRoom(room, {
    missingPrefix: false,
    onReady: publishReady,
  })
  if (ctx.committer.hasReplay(room.id)) ctx.checkpoint.markInactive(room.id)
  if (result.kind === 'blocked') {
    notifyPersistencePaused(ctx, room)
    if (!ctx.committer.isRetrying(room.id)) {
      sendCommandError(ctx, result.error, requestId)
      return
    }
    return new Promise((resolve) => {
      if (!ctx.committer?.waitUntilReady(room.id, () => resolve())) resolve()
    })
  }
  beforePublish()
  if (ctx.committer.isRecording(room.id)) {
    ctx.broadcaster.broadcastCommitted(room, response, 'reconnect', requestId)
  } else {
    ctx.broadcaster.broadcastState(room, response, 'reconnect', requestId)
  }
  onReady()
}

const assertOwnSeat = (ctx: ConnectionCtx, expectedPlayerIndex: unknown, requestId?: string): boolean => {
  if (typeof expectedPlayerIndex !== 'number' || expectedPlayerIndex !== ctx.currentPlayerIndex) {
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
  room.customSessionExecutor?.execute(method, args) ?? room.session.withCtx(local)

const useSessionResponse = (
  result: SessionResponse | Promise<SessionResponse>,
  use: (response: SessionResponse) => void | Promise<void>,
): void | Promise<void> => result instanceof Promise ? result.then(use) : use(result)

function handleAuth(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'auth' }>): void {
  if (!msg.token) {
    sendCommandError(ctx, 'invalid or expired token', msg.requestId)
    return
  }
  const user = validateSession(msg.token)
  if (!user) {
    sendCommandError(ctx, 'invalid or expired token', msg.requestId)
    return
  }
  ctx.authenticated = true
  ctx.currentUserId = user.id
  ctx.broadcaster.sendTo(ctx.ws, { type: 'authOk', userId: user.id, username: user.username })
}

function handleCreateRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'createRoom' }>): void {
  const ordinaryRoomCount = [...ctx.registry.iter()]
    .filter((room) => !isDevRoom(room.id))
    .length
  if (ordinaryRoomCount >= MAX_ORDINARY_ROOMS) {
    sendCommandError(ctx, 'room capacity reached', msg.requestId)
    return
  }
  const persistence = ctx.committer?.canCreateRoom()
  if (persistence && !persistence.ok) {
    sendCommandError(ctx, persistence.error, msg.requestId)
    return
  }
  const roomId = generateRoomId(ctx)
  if (!roomId) { sendCommandError(ctx, 'unable to allocate room id', msg.requestId); return }
  const rawMaxPlayers = typeof (msg as Record<string, unknown>).maxPlayers === 'number'
    ? (msg as Record<string, unknown>).maxPlayers as number
    : 2
  const maxPlayers = Number.isFinite(rawMaxPlayers)
    ? Math.min(Math.max(2, Math.floor(rawMaxPlayers)), 6)
    : 2
  const enableCommunityDeck = (msg as Record<string, unknown>).enableCommunityDeck === true
  const requestedCustomCardDbIds = Array.isArray((msg as Record<string, unknown>).customCardIds)
    ? (msg as Record<string, unknown>).customCardIds as string[]
    : []
  const customCardDbIds = enableCommunityDeck ? requestedCustomCardDbIds : []
  const draftOptions = parseDraftOptions(msg as Record<string, unknown>)
  if (!draftOptions.ok) { sendCommandError(ctx, draftOptions.error, msg.requestId); return }
  const enableParentCards = (msg as Record<string, unknown>).enableParentCards === true
  const draftParents = (msg as Record<string, unknown>).draftParents === false ? false : undefined
  const enableThroughTheSeasons = (msg as Record<string, unknown>).enableThroughTheSeasons === true
  const enableFarmersOfTheMoor = (msg as Record<string, unknown>).enableFarmersOfTheMoor === true
  const allowIncompleteFarmersOfTheMoorMinorDeal =
    (msg as Record<string, unknown>).allowIncompleteFarmersOfTheMoorMinorDeal === true
  const loadedCustomCards = loadCustomCards(customCardDbIds, ctx.currentUserId, { liveOnly: true })
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
      {
        playerCount: maxPlayers,
        enableCommunityDeck,
        enableParentCards,
        ...(draftParents === false ? { draftParents } : {}),
        enableThroughTheSeasons,
        enableFarmersOfTheMoor,
        allowIncompleteFarmersOfTheMoorMinorDeal,
        ...(draftOptions.value
          ? {
              draftMode: draftOptions.value.draftMode,
              draftPoolSize: draftOptions.value.draftPoolSize,
            }
          : {}),
      },
    )
  } catch (err) {
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
    session: created.session,
    ...(created.executor ? { customSessionExecutor: created.executor } : {}),
    players: [],
    seatOwners: ctx.currentUserId
      ? [{ playerIndex: 0, userId: ctx.currentUserId }]
      : [],
    maxPlayers,
    version: 0,
    status: 'waiting',
    createdBy: ctx.currentUserId,
    customCardDbIds: loadedCustomCards.loadedDbIds,
    customCards,
    enableParentCards,
    draftParents,
    draftMode: draftOptions.value?.draftMode,
    draftPoolSize: draftOptions.value?.draftPoolSize,
    enableThroughTheSeasons,
    enableFarmersOfTheMoor,
    allowIncompleteFarmersOfTheMoorMinorDeal,
  }
  ctx.committer?.lockNewRoom(room)
  ctx.registry.set(room)
  ctx.currentRoom = room
  ctx.currentPlayerIndex = 0
  const name = typeof (msg as Record<string, unknown>).name === 'string'
    ? (msg as Record<string, unknown>).name as string
    : 'Player 1'
  room.players.push({ ws: ctx.ws, playerIndex: 0, name, userId: ctx.currentUserId })
  if (room.customSessionExecutor) void room.customSessionExecutor.updatePlayerNames([[0, name]])
  else room.session.updatePlayerName(0, name)
  ctx.checkpoint.recordCreated(room)
  ctx.broadcaster.sendTo(ctx.ws, { type: 'roomCreated', roomId, playerIndex: 0, maxPlayers })
}

function handleJoinRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'joinRoom' }>): void | Promise<void> {
  const roomId = msg.roomId
  if (msg.intent !== undefined && msg.intent !== 'join' && msg.intent !== 'resume') {
    sendCommandError(ctx, 'invalid join intent', msg.requestId)
    return
  }
  const lifecycle = ctx.gameContextStore?.lifecycle(roomId)
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
  const blocked = ctx.committer?.blockedError(room.id)
  if (blocked) {
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
      handleJoinRoom(ctx, msg)
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
  ctx.currentRoom = room
  ctx.currentPlayerIndex = seat.playerIndex
  const requestedName = typeof (msg as Record<string, unknown>).name === 'string'
    ? (msg as Record<string, unknown>).name as string
    : `Player ${ctx.currentPlayerIndex + 1}`
  const name = wasPlaying
    ? room.session.state.players[ctx.currentPlayerIndex]?.name ?? requestedName
    : requestedName
  if (seat.replacedExistingPlayer) {
    const existingPlayer = room.players.find(
      (player) => player.playerIndex === ctx.currentPlayerIndex,
    )
    if (existingPlayer) {
      ctx.broadcaster.sendTo(existingPlayer.ws, {
        type: 'seat_replaced',
        roomId,
        playerIndex: ctx.currentPlayerIndex,
      })
      try { existingPlayer.ws.close(4001, 'seat replaced') } catch { /* ignore */ }
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
  ctx.gameContextStore?.clearActiveExpiry(room.id)
  ctx.registry.touchActivity(room.id, Date.now())
  const playerCount = roomOccupiedSeatCount(room)
  const roomFull = playerCount >= room.maxPlayers
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
  const publishJoin = (): void => {
    ctx.broadcaster.sendTo(ctx.ws, {
      type: 'roomJoined',
      roomId,
      playerIndex: ctx.currentPlayerIndex,
      status: room.status === 'waiting' ? 'waiting' : 'playing',
      players,
      maxPlayers: room.maxPlayers,
    })
    ctx.broadcaster.broadcastEvent(room, {
      type: 'playerJoined',
      playerIndex: ctx.currentPlayerIndex,
      name,
      playerCount,
      maxPlayers: room.maxPlayers,
    })
  }
  const finishJoin = (updatedResponse?: SessionResponse): void | Promise<void> => {
    if (starting) {
      const response = updatedResponse ?? executeRoomSession(
        room,
        'getState',
        [],
        () => room.session.getState(),
      )
      return useSessionResponse(response, (resp) => {
        return publishInitialState(ctx, room, resp, undefined, () => {
          ctx.checkpoint.recordMeta(room)
          publishJoin()
        }, () => {
          ctx.broadcaster.broadcastEvent(room, { type: 'gameStarted' })
        })
      })
    }
    ctx.checkpoint.recordMeta(room)
    publishJoin()
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

function handleDissolveRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'dissolveRoom' }>): void {
  const room = requireRoom(ctx, msg.requestId)
  if (!room) return
  const blocked = ctx.committer?.blockedError(room.id)
  if (blocked) {
    sendCommandError(ctx, `room saving is paused: ${blocked}`, msg.requestId)
    return
  }
  const result = ctx.lobby.dissolveRoomById(room.id, ctx.currentUserId)
  if (!result.ok) { sendCommandError(ctx, result.error ?? 'dissolve failed', msg.requestId); return }
  ctx.currentRoom = null
}

function handleGetState(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'getState' }>): void | Promise<void> {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const blocked = ctx.committer?.blockedError(room.id)
  if (blocked) {
    sendCommandError(ctx, `room saving is paused: ${blocked}`, msg.requestId)
    return
  }
  return useSessionResponse(
    executeRoomSession(room, 'getState', [], () => room.session.getState()),
    (resp) => ctx.broadcaster.sendStateTo(ctx.ws, room, resp, msg.requestId),
  )
}

function handleAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'action' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'takeAction',
      [ctx.currentPlayerIndex, msg.spaceId],
      () => room.session.takeAction(ctx.currentPlayerIndex, msg.spaceId),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'action'),
  )
}

function handleSpecialAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'specialAction' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'takeSpecialAction',
      [ctx.currentPlayerIndex, msg.cardId, msg.actionId, msg.payload],
      () => room.session.takeSpecialAction(ctx.currentPlayerIndex, msg.cardId, msg.actionId, msg.payload),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'action'),
  )
}

function handleChoice(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'choice' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'resolveChoice',
      [ctx.currentPlayerIndex, msg.value, msg.payload],
      () => room.session.resolveChoice(ctx.currentPlayerIndex, msg.value, msg.payload),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'choice'),
  )
}

function handleAnytime(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'anytime' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'takeAnytimeAction',
      [ctx.currentPlayerIndex, msg.actionId],
      () => room.session.takeAnytimeAction(ctx.currentPlayerIndex, msg.actionId),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'anytime'),
  )
}

function handleOrdinaryDrawKeep(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'ordinaryDrawKeep' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'resolveOrdinaryCardDrawChoice',
      [ctx.currentPlayerIndex, msg.choiceId, msg.keepCardId],
      () => room.session.resolveOrdinaryCardDrawChoice(ctx.currentPlayerIndex, msg.choiceId, msg.keepCardId),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'choice'),
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
  return useSessionResponse(
    executeRoomSession(
      room,
      'commitSelectionChoice',
      [ctx.currentPlayerIndex, msg.payload],
      () => room.session.commitSelectionChoice(ctx.currentPlayerIndex, msg.payload),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'choice'),
  )
}

function handleParentSubmit(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'parentSubmit' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  return useSessionResponse(
    executeRoomSession(
      room,
      'submitParentSelection',
      [ctx.currentPlayerIndex, msg.selection],
      () => room.session.submitParentSelection(ctx.currentPlayerIndex, msg.selection),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'choice'),
  )
}

function handleUndoStep(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'undoStep' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  return useSessionResponse(
    executeRoomSession(room, 'undoStep', [], () => room.session.undoStep()),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'undo'),
  )
}

function handleUndoAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'undoAction' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  return useSessionResponse(
    executeRoomSession(room, 'undoAction', [], () => room.session.undoAction()),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'undo'),
  )
}

function handleNewGame(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'newGame' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
  const persistence = ctx.committer?.canCreateRoom()
  if (persistence && !persistence.ok) {
    sendCommandError(ctx, persistence.error, msg.requestId)
    return
  }
  const previousRoomId = room.id
  const completedGame = room.session.state.gameOver
  if (completedGame && !ctx.committer?.hasReplay(previousRoomId)) {
    const completion = ctx.checkpoint.completeGame(room)
    if (!completion.ok) {
      sendCommandError(ctx, `unable to archive completed game: ${completion.error}`, msg.requestId)
      return
    }
  }
  // A rematch is a new game: reload through the current gate instead of
  // reusing the embedded snapshot, so takeover (#642) and unpublish apply
  // to the fresh room while the finished game stays untouched. The id list
  // is refreshed alongside so a stale id cannot mark this room for a later
  // takedown it does not deserve.
  const enableCommunityDeck = room.session.state.enableCommunityDeck
  const reloaded = loadCustomCards(
    enableCommunityDeck ? room.customCardDbIds ?? [] : [],
    room.createdBy,
    { liveOnly: true },
  )
  const customCards = reloaded.cards
  const enableParentCards = room.enableParentCards ?? room.session.state.enableParentCards
  const draftMode = room.draftMode ?? room.session.state.draftMode
  const draftPoolSize = room.draftPoolSize ?? room.session.state.draftPoolSize
  const enableThroughTheSeasons = room.enableThroughTheSeasons ?? room.session.state.enableThroughTheSeasons
  const enableFarmersOfTheMoor = room.enableFarmersOfTheMoor ?? (room.session.state.enableFarmersOfTheMoor === true)
  const allowIncompleteFarmersOfTheMoorMinorDeal = room.allowIncompleteFarmersOfTheMoorMinorDeal ?? false
  let created: ReturnType<typeof createIsolatedGameSession>
  try {
    created = createIsolatedGameSession(
      typeof msg.seed === 'number' ? msg.seed : undefined,
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
      },
    )
  } catch (err) {
    sendCommandError(ctx, err instanceof Error ? err.message : String(err), msg.requestId)
    return
  }
  if (created.executor && !created.executor.reserveWorkerSlot(room.customSessionExecutor)) {
    created.executor.dispose()
    created.session.dispose()
    sendCommandError(ctx, 'executable room capacity reached', msg.requestId)
    return
  }
  const nextRoomId = generateRoomId(ctx, fixedDevRoomRootId(previousRoomId))
  if (!nextRoomId) {
    created.executor?.dispose()
    created.session.dispose()
    sendCommandError(ctx, 'unable to allocate room id', msg.requestId)
    return
  }
  if (!completedGame) ctx.checkpoint.discardRoom(previousRoomId)
  ctx.registry.delete(previousRoomId)
  ctx.registry.clearActivity(previousRoomId)
  ctx.committer?.retireRoom(previousRoomId)
  room.id = nextRoomId
  room.session = created.session
  if (created.executor) room.customSessionExecutor = created.executor
  else delete room.customSessionExecutor
  room.version = 0
  room.seatOwners = room.players.flatMap((player) =>
    player.userId
      ? [{ playerIndex: player.playerIndex, userId: player.userId }]
      : []
  )
  room.status = isDevRoom(room.id) || roomOccupiedSeatCount(room) >= room.maxPlayers ? 'playing' : 'waiting'
  room.startedAt = room.status === 'playing' ? Date.now() : undefined
  room.enableParentCards = enableParentCards
  room.draftMode = draftMode
  room.draftPoolSize = draftPoolSize
  room.enableThroughTheSeasons = enableThroughTheSeasons
  room.enableFarmersOfTheMoor = enableFarmersOfTheMoor
  room.allowIncompleteFarmersOfTheMoorMinorDeal = allowIncompleteFarmersOfTheMoorMinorDeal
  room.customCardDbIds = reloaded.loadedDbIds
  room.customCards = customCards
  ctx.committer?.lockNewRoom(room)
  const names = room.players.map((player) => [player.playerIndex, player.name] as [number, string])
  let response: SessionResponse | Promise<SessionResponse>
  if (room.customSessionExecutor) {
    response = room.customSessionExecutor.execute('updatePlayerNames', [names])
  } else {
    for (const [playerIndex, name] of names) room.session.updatePlayerName(playerIndex, name)
    response = room.session.withCtx(() => room.session.getState())
  }
  ctx.registry.set(room)
  ctx.registry.touchActivity(room.id, Date.now())
  ctx.checkpoint.recordCreated(room)
  return useSessionResponse(
    response,
    (resp) => {
      if (room.status === 'playing') {
        return publishInitialState(ctx, room, resp, msg.requestId, () => {}, () => {})
      } else {
        ctx.broadcaster.broadcastEvent(room, {
          type: 'roomWaiting',
          roomId: room.id,
          players: room.players.map(({ playerIndex, name }) => ({ playerIndex, name })),
          maxPlayers: room.maxPlayers,
        })
        ctx.broadcaster.broadcastState(room, resp, 'reconnect', msg.requestId)
      }
    },
  )
}

function handleLoadGame(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'loadGame' }>): void | Promise<void> {
  const room = requireWritableRoom(ctx, msg.requestId); if (!room) return
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
  return useSessionResponse(
    executeRoomSession(
      room,
      'submitDraftPick',
      [msg.playerId, msg.pick],
      () => room.session.submitDraftPick(msg.playerId, msg.pick),
    ),
    (resp) => publishCommandResponse(ctx, room, resp, msg, 'draftSubmit'),
  )
}

const handlers: { [K in ClientCommand['type']]: Handler<Extract<ClientCommand, { type: K }>> } = {
  auth: handleAuth,
  createRoom: handleCreateRoom,
  joinRoom: handleJoinRoom,
  dissolveRoom: handleDissolveRoom,
  getState: handleGetState,
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

export function dispatch(ctx: ConnectionCtx, msg: ClientCommand): void | Promise<void> {
  const fn = handlers[msg.type] as Handler | undefined
  if (!fn) { sendCommandError(ctx, `unknown command: ${msg.type}`, msg.requestId); return }
  const acceptedRoom = ctx.currentRoom
  const acceptedPlayerIndex = ctx.currentPlayerIndex
  const room = msg.type === 'joinRoom' ? ctx.registry.get(msg.roomId) : acceptedRoom
  const queuedRoom = room && (
    msg.type === 'newGame'
    || !!room.customSessionExecutor
    || customRoomQueues.has(room)
  ) ? room : undefined
  const pendingConnection = connectionQueues.get(ctx)
  const pending = [
    pendingConnection,
    queuedRoom ? customRoomQueues.get(queuedRoom) : undefined,
  ].filter((queue): queue is Promise<void> => !!queue)
  const run = (): void | Promise<void> => {
    if (ctx.currentRoom !== acceptedRoom || ctx.currentPlayerIndex !== acceptedPlayerIndex) {
      sendCommandError(ctx, 'connection context changed before command ran', msg.requestId)
      return
    }
    return fn(ctx, msg as never)
  }
  const result = pending.length > 0 ? Promise.all(pending).then(run) : run()
  if (!(result instanceof Promise)) return
  if (pendingConnection || queuedRoom) trackQueue(connectionQueues, ctx, result)
  if (queuedRoom) trackQueue(customRoomQueues, queuedRoom, result)
  return result
}
