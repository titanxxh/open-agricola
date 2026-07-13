import { GameSession } from '../game/authoritative-session.ts'
import {
  isFixedDevRoom,
  resolveJoinPlayerIndex,
  resolveJoinRequestPlayerIndex,
  type Room,
} from '../game/room.ts'
import { validateSession } from '../auth.ts'
import { getDb } from '../db.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { CustomCodeManifest } from '../../shared/custom-code/types.ts'
import type { ClientCommand } from '../../shared/contract/protocol/ws.ts'
import type { ConnectionCtx } from './connection-ctx.ts'

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

function loadCustomCardsFromDb(cardDbIds: string[], requestUserId?: string): CustomCardData[] {
  if (!cardDbIds.length) return []
  const db = getDb()
  const result: CustomCardData[] = []
  for (const dbId of cardDbIds) {
    const row = db.prepare(
      'SELECT card_type, card_json, code_manifest, art_url, status, author_id FROM workshop_cards WHERE id = ?',
    ).get(dbId) as {
      card_type: string
      card_json: string
      code_manifest: string | null
      art_url: string | null
      status: string
      author_id: string
    } | undefined
    if (!row) continue
    const allowed = row.status === 'published' || (row.status === 'draft' && requestUserId === row.author_id)
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
    } catch { /* skip malformed */ }
  }
  return result
}

const generateRoomId = () => Math.random().toString(36).slice(2, 8)

const sendCommandError = (ctx: ConnectionCtx, error: string, requestId?: string) => {
  ctx.broadcaster.sendTo(ctx.ws, { type: 'error', error, requestId })
}

const requireRoom = (ctx: ConnectionCtx, requestId?: string): Room | null => {
  if (!ctx.currentRoom) { sendCommandError(ctx, 'not in a room', requestId); return null }
  return ctx.currentRoom
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
  const state = ctx.currentRoom.session.getState().state
  const ownId = state.players[ctx.currentPlayerIndex]?.id
  if (typeof expectedPlayerId !== 'string' || !ownId || expectedPlayerId !== ownId) {
    sendCommandError(ctx, 'seat mismatch: you cannot act on another player', requestId)
    return false
  }
  return true
}

const assertDevCommandAllowed = (ctx: ConnectionCtx, room: Room, requestId?: string): boolean => {
  if (isFixedDevRoom(room.id)) return true
  sendCommandError(ctx, 'dev commands disabled for this room', requestId)
  return false
}

type Handler<M extends ClientCommand = ClientCommand> = (ctx: ConnectionCtx, msg: M) => void

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
  const roomId = generateRoomId()
  const rawMaxPlayers = typeof (msg as Record<string, unknown>).maxPlayers === 'number'
    ? (msg as Record<string, unknown>).maxPlayers as number
    : 2
  const maxPlayers = Number.isFinite(rawMaxPlayers)
    ? Math.min(Math.max(2, Math.floor(rawMaxPlayers)), 6)
    : 2
  const customCardDbIds = Array.isArray((msg as Record<string, unknown>).customCardIds)
    ? (msg as Record<string, unknown>).customCardIds as string[]
    : []
  const draftOptions = parseDraftOptions(msg as Record<string, unknown>)
  if (!draftOptions.ok) { sendCommandError(ctx, draftOptions.error, msg.requestId); return }
  const enableCommunityDeck = (msg as Record<string, unknown>).enableCommunityDeck === true
  const enableParentCards = (msg as Record<string, unknown>).enableParentCards === true
  const draftParents = (msg as Record<string, unknown>).draftParents === false ? false : undefined
  const enableThroughTheSeasons = (msg as Record<string, unknown>).enableThroughTheSeasons === true
  const enableFarmersOfTheMoor = (msg as Record<string, unknown>).enableFarmersOfTheMoor === true
  const allowIncompleteFarmersOfTheMoorMinorDeal =
    (msg as Record<string, unknown>).allowIncompleteFarmersOfTheMoorMinorDeal === true
  const customCards = loadCustomCardsFromDb(customCardDbIds, ctx.currentUserId)
  let session: GameSession
  try {
    session = new GameSession(
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
  const room: Room = {
    id: roomId,
    session,
    players: [],
    maxPlayers,
    version: 0,
    status: 'waiting',
    createdBy: ctx.currentUserId,
    customCardDbIds,
    enableParentCards,
    draftParents,
    enableThroughTheSeasons,
    enableFarmersOfTheMoor,
    allowIncompleteFarmersOfTheMoorMinorDeal,
  }
  ctx.registry.set(room)
  ctx.currentRoom = room
  ctx.currentPlayerIndex = 0
  const name = typeof (msg as Record<string, unknown>).name === 'string'
    ? (msg as Record<string, unknown>).name as string
    : 'Player 1'
  room.players.push({ ws: ctx.ws, playerIndex: 0, name, userId: ctx.currentUserId })
  room.session.updatePlayerName(0, name)
  ctx.checkpoint.recordCreated(room)
  ctx.broadcaster.sendTo(ctx.ws, { type: 'roomCreated', roomId, playerIndex: 0, maxPlayers })
}

function handleJoinRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'joinRoom' }>): void {
  const roomId = msg.roomId
  const room = ctx.registry.get(roomId)
  if (!room) { sendCommandError(ctx, 'room not found', msg.requestId); return }
  const rawRequestedPlayerIndex =
    typeof msg.requestedPlayerIndex === 'number'
      ? msg.requestedPlayerIndex
      : undefined
  const requested = resolveJoinRequestPlayerIndex(room, rawRequestedPlayerIndex, ctx.currentUserId)
  if (!requested.ok) {
    sendCommandError(ctx, requested.error, msg.requestId)
    return
  }
  const seat = resolveJoinPlayerIndex(room, requested.requestedPlayerIndex, ctx.currentUserId)
  if (!seat.ok) { sendCommandError(ctx, seat.error, msg.requestId); return }
  ctx.currentRoom = room
  ctx.currentPlayerIndex = seat.playerIndex
  const name = typeof (msg as Record<string, unknown>).name === 'string'
    ? (msg as Record<string, unknown>).name as string
    : `Player ${ctx.currentPlayerIndex + 1}`
  if (seat.replacedExistingPlayer) {
    const existingPlayer = room.players.find(
      (player) => player.playerIndex === ctx.currentPlayerIndex,
    )
    if (existingPlayer) {
      try { existingPlayer.ws.close() } catch { /* ignore */ }
    }
  }
  room.players = room.players.filter(
    (player) => player.ws !== ctx.ws && player.playerIndex !== ctx.currentPlayerIndex,
  )
  room.players.push({ ws: ctx.ws, playerIndex: ctx.currentPlayerIndex, name, userId: ctx.currentUserId })
  room.players.sort((a, b) => a.playerIndex - b.playerIndex)
  room.session.updatePlayerName(ctx.currentPlayerIndex, name)
  ctx.checkpoint.recordMeta(room)
  ctx.broadcaster.sendTo(ctx.ws, { type: 'roomJoined', roomId, playerIndex: ctx.currentPlayerIndex })
  ctx.broadcaster.broadcastEvent(room, {
    type: 'playerJoined',
    playerIndex: ctx.currentPlayerIndex,
    name,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
  })
  if (room.players.length === room.maxPlayers) {
    room.status = 'playing'
    for (const p of room.players) {
      room.session.updatePlayerName(p.playerIndex, p.name)
    }
    const resp = room.session.withCtx(() => room.session.getState())
    ctx.broadcaster.broadcastState(room, resp, 'reconnect')
    ctx.broadcaster.broadcastEvent(room, { type: 'gameStarted' })
  }
}

function handleDissolveRoom(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'dissolveRoom' }>): void {
  if (!ctx.currentRoom) { sendCommandError(ctx, 'not in a room', msg.requestId); return }
  const result = ctx.lobby.dissolveRoomById(ctx.currentRoom.id, ctx.currentUserId)
  if (!result.ok) { sendCommandError(ctx, result.error ?? 'dissolve failed', msg.requestId); return }
  ctx.currentRoom = null
}

function handleGetState(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'getState' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const resp = room.session.withCtx(() => room.session.getState())
  ctx.broadcaster.sendStateTo(ctx.ws, room, resp, msg.requestId)
}

function handleAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'action' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const resp = room.session.withCtx(() => room.session.takeAction(ctx.currentPlayerIndex, msg.spaceId))
  ctx.broadcaster.broadcastState(room, resp, 'action', msg.requestId)
}

function handleSpecialAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'specialAction' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const resp = room.session.withCtx(() =>
    room.session.takeSpecialAction(ctx.currentPlayerIndex, msg.cardId, msg.actionId, msg.payload),
  )
  ctx.broadcaster.broadcastState(room, resp, 'action', msg.requestId)
}

function handleChoice(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'choice' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const resp = room.session.withCtx(() => room.session.resolveChoice(ctx.currentPlayerIndex, msg.value, msg.payload))
  ctx.broadcaster.broadcastState(room, resp, 'choice', msg.requestId)
}

function handleAnytime(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'anytime' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const resp = room.session.withCtx(() => room.session.takeAnytimeAction(ctx.currentPlayerIndex, msg.actionId))
  ctx.broadcaster.broadcastState(room, resp, 'anytime', msg.requestId)
}

function handleOrdinaryDrawKeep(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'ordinaryDrawKeep' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  const resp = room.session.withCtx(() =>
    room.session.resolveOrdinaryCardDrawChoice(ctx.currentPlayerIndex, msg.choiceId, msg.keepCardId),
  )
  ctx.broadcaster.broadcastState(room, resp, 'choice', msg.requestId)
}

function handleRoundEnd(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'roundEnd' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const resp = room.session.withCtx(() => room.session.performRoundEnd())
  ctx.broadcaster.broadcastState(room, resp, 'action', msg.requestId)
}

function handleCommitSelection(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'commitSelection' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  const resp = room.session.withCtx(() => room.session.commitSelectionChoice(ctx.currentPlayerIndex, msg.payload))
  ctx.broadcaster.broadcastState(room, resp, 'choice', msg.requestId)
}

function handleParentSubmit(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'parentSubmit' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  const resp = room.session.withCtx(() => room.session.submitParentSelection(ctx.currentPlayerIndex, msg.selection))
  ctx.broadcaster.broadcastState(room, resp, 'choice', msg.requestId)
}

function handleUndoStep(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'undoStep' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const resp = room.session.withCtx(() => room.session.undoStep())
  ctx.broadcaster.broadcastState(room, resp, 'undo', msg.requestId)
}

function handleUndoAction(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'undoAction' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const resp = room.session.withCtx(() => room.session.undoAction())
  ctx.broadcaster.broadcastState(room, resp, 'undo', msg.requestId)
}

function handleNewGame(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'newGame' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const customCards = loadCustomCardsFromDb(room.customCardDbIds ?? [], room.createdBy)
  const enableParentCards = room.enableParentCards ?? room.session.state.enableParentCards
  const enableThroughTheSeasons = room.enableThroughTheSeasons ?? room.session.state.enableThroughTheSeasons
  const enableFarmersOfTheMoor = room.enableFarmersOfTheMoor ?? (room.session.state.enableFarmersOfTheMoor === true)
  const allowIncompleteFarmersOfTheMoorMinorDeal = room.allowIncompleteFarmersOfTheMoorMinorDeal ?? false
  try {
    room.session = new GameSession(
      typeof msg.seed === 'number' ? msg.seed : undefined,
      customCards.length > 0 ? customCards : undefined,
      {
        playerCount: room.maxPlayers,
        enableParentCards,
        ...(room.draftParents === false ? { draftParents: false } : {}),
        enableThroughTheSeasons,
        enableFarmersOfTheMoor,
        allowIncompleteFarmersOfTheMoorMinorDeal,
      },
    )
  } catch (err) {
    sendCommandError(ctx, err instanceof Error ? err.message : String(err), msg.requestId)
    return
  }
  room.enableParentCards = enableParentCards
  room.enableThroughTheSeasons = enableThroughTheSeasons
  room.enableFarmersOfTheMoor = enableFarmersOfTheMoor
  room.allowIncompleteFarmersOfTheMoorMinorDeal = allowIncompleteFarmersOfTheMoorMinorDeal
  for (const player of room.players) {
    room.session.updatePlayerName(player.playerIndex, player.name)
  }
  const resp = room.session.withCtx(() => room.session.getState())
  ctx.broadcaster.broadcastState(room, resp, 'reconnect', msg.requestId)
}

function handleLoadGame(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'loadGame' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  const resp = room.session.withCtx(() => room.session.loadState(msg.state))
  ctx.broadcaster.broadcastState(room, resp, 'reconnect', msg.requestId)
}

function handleDevSetResources(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devSetResources' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  const resp = room.session.withCtx(() => room.session.devSetResources(msg.playerIndex, msg.resources))
  ctx.broadcaster.broadcastState(room, resp, 'dev', msg.requestId)
}

function handleDevSetRound(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devSetRound' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  const resp = room.session.withCtx(() => room.session.devSetRound(msg.round))
  ctx.broadcaster.broadcastState(room, resp, 'dev', msg.requestId)
}

function handleDevDrawCard(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devDrawCard' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnSeat(ctx, msg.playerIndex, msg.requestId)) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  const resp = room.session.withCtx(() => room.session.devDrawCard(msg.playerIndex, msg.cardId))
  ctx.broadcaster.broadcastState(room, resp, 'dev', msg.requestId)
}

function handleDevPlayCard(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devPlayCard' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  const resp = room.session.withCtx(() => room.session.devPlayCard(msg.playerIndex, msg.cardId))
  ctx.broadcaster.broadcastState(room, resp, 'dev', msg.requestId)
}

function handleDevCreatePasture(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'devCreatePasture' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertDevCommandAllowed(ctx, room, msg.requestId)) return
  const resp = room.session.withCtx(() => room.session.startDevFenceSelect(ctx.currentPlayerIndex))
  ctx.broadcaster.broadcastState(room, resp, 'action', msg.requestId)
}

function handleDraftSubmit(ctx: ConnectionCtx, msg: Extract<ClientCommand, { type: 'draftSubmit' }>): void {
  const room = requireRoom(ctx, msg.requestId); if (!room) return
  if (!assertOwnPlayerId(ctx, msg.playerId, msg.requestId)) return
  const resp = room.session.withCtx(() => room.session.submitDraftPick(msg.playerId, msg.pick))
  ctx.broadcaster.broadcastState(room, resp, 'draftSubmit', msg.requestId)
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

export function dispatch(ctx: ConnectionCtx, msg: ClientCommand): void {
  const fn = handlers[msg.type] as Handler | undefined
  if (!fn) { sendCommandError(ctx, `unknown command: ${msg.type}`, msg.requestId); return }
  fn(ctx, msg as never)
}
