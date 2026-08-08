import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { join } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { GameSession } from '../game/authoritative-session.ts'
import { RoomRegistry } from '../game/room-registry.ts'
import {
  FIXED_DEV_ROOMS,
  PLAYING_EMPTY_ROOM_TTL_MS,
  WAITING_EMPTY_ROOM_TTL_MS,
  buildFixedDevRoomInitialStateOptions,
  emptyRoomTtlMs,
  isDevRoom,
  parseFixedDevRoomStartupOptions,
  removePlayerFromRoom,
  snapshotToRoom,
  type Room,
} from '../game/room.ts'
import { createLobby, type Lobby } from '../game/lobby.ts'
import type { RoomPersistence } from '../game/persistence/room-persistence.ts'
import { createRoomPersistenceCheckpoint, type RoomPersistenceCheckpoint } from '../game/room-persistence-checkpoint.ts'
import { Broadcaster } from './broadcaster.ts'
import { createConnectionCtx } from './connection-ctx.ts'
import { dispatch, loadCustomCardsFromDb } from './room-router.ts'
import type { ClientCommand } from '../../shared/contract/protocol/ws.ts'
import { readCookies, SESSION_COOKIE } from '../auth-cookies.ts'
import { validateSession } from '../auth.ts'
import { isTrustedOrigin } from '../http-origin.ts'
import { RoomCommitter } from '../game/room-committer.ts'
import { SqliteRoomPersistence } from '../game/persistence/sqlite-adapter.ts'
import type { GameContextStore } from '../game/game-context-store.ts'
export { viewerBuildExists } from '../game/replay-viewer-build.ts'
import { viewerBuildExists } from '../game/replay-viewer-build.ts'

const WS_AUTH_TIMEOUT_MS = 5000
const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000

const ALLOW_ANONYMOUS_WS: boolean = (() => {
  if (process.env.ALLOW_ANONYMOUS_WS !== undefined) {
    return process.env.ALLOW_ANONYMOUS_WS === 'true'
  }
  return process.env.NODE_ENV !== 'production'
})()

// ── Startup helpers ──────────────────────────────────────────────────────────

const ensureFixedDevRooms = (
  registry: RoomRegistry,
  persistence: RoomPersistence,
  checkpoint: RoomPersistenceCheckpoint,
): void => {
  if (process.env.NODE_ENV === 'production') return
  const startupOptions = parseFixedDevRoomStartupOptions()
  for (const { id, playerCount } of FIXED_DEV_ROOMS) {
    if (registry.has(id)) continue
    const snap = persistence.load(id)
    if (snap) {
      const room = snapshotToRoom(snap)
      room.startedAt ??= Date.now()
      room.draftParents = startupOptions.draftParents ?? room.draftParents
      registry.set(room)
    } else {
      const session = new GameSession(
        undefined,
        undefined,
        buildFixedDevRoomInitialStateOptions(playerCount, startupOptions),
      )
      const room: Room = {
        id,
        session,
        players: [],
        seatOwners: [],
        maxPlayers: playerCount,
        version: 0,
        status: 'playing',
        startedAt: Date.now(),
        enableParentCards: session.state.enableParentCards,
        draftParents: startupOptions.draftParents,
        draftMode: startupOptions.draftMode,
        draftPoolSize: startupOptions.draftPoolSize,
        enableThroughTheSeasons: session.state.enableThroughTheSeasons,
        enableFarmersOfTheMoor: session.state.enableFarmersOfTheMoor === true,
        allowIncompleteFarmersOfTheMoorMinorDeal: startupOptions.allowIncompleteFarmersOfTheMoorMinorDeal === true,
      }
      registry.set(room)
      checkpoint.recordState(room)
    }
  }
}

const restoreRooms = (
  registry: RoomRegistry,
  persistence: RoomPersistence,
  checkpoint: RoomPersistenceCheckpoint,
  committer: RoomCommitter | undefined,
  gameContextStore: GameContextStore | undefined,
  now: number,
): void => {
  const fixedIds = FIXED_DEV_ROOMS.map((r) => r.id)
  const snapshots = persistence.listRestorable({
    now,
    waitingTtlMs: WAITING_EMPTY_ROOM_TTL_MS,
    playingTtlMs: PLAYING_EMPTY_ROOM_TTL_MS,
    excludeIds: fixedIds,
  })
  committer?.cleanupReplayAssets()
  for (const snap of snapshots) {
    if (registry.has(snap.id)) continue
    const customCards = snap.meta.customCards ?? loadCustomCardsFromDb(
      snap.meta.customCardDbIds,
      snap.meta.createdBy ?? undefined,
    )
    const room = snapshotToRoom(snap, customCards)
    let metaChanged = snap.meta.customCards === undefined
    if (room.replayRecording === undefined && customCards.length > 0) {
      room.replayRecording = false
      metaChanged = true
    } else if (room.status === 'waiting' && room.replayRecording === undefined) {
      committer?.lockNewRoom(room)
      metaChanged = true
    }
    registry.set(room)
    if (metaChanged) checkpoint.recordMeta(room)
    const prepared = committer?.prepareRoom(room, {
      missingPrefix: room.status === 'playing',
    })
    if (committer?.hasReplay(room.id)) checkpoint.markInactive(room.id)
    if (prepared?.kind === 'blocked') {
      console.warn(JSON.stringify({
        event: 'restored_room_replay_blocked',
        roomId: room.id,
        error: prepared.error,
      }))
    }
    const ttl = emptyRoomTtlMs(room)
    const persistedExpiry = gameContextStore?.activeExpiresAt(room.id)
    const expiresAt = persistedExpiry ?? now + ttl
    if (persistedExpiry === null) {
      gameContextStore?.setActiveExpiry(room.id, expiresAt)
    }
    registry.touchActivity(snap.id, expiresAt - ttl)
    console.log(`[ws-server] restored room ${snap.id}`)
  }
}

const startRoomCleanup = (
  registry: RoomRegistry,
  checkpoint: RoomPersistenceCheckpoint,
  committer: RoomCommitter | undefined,
  intervalMs: number = ROOM_CLEANUP_INTERVAL_MS,
): NodeJS.Timeout => {
  return setInterval(() => {
    const now = Date.now()
    for (const room of registry.iter()) {
      if (isDevRoom(room.id)) continue
      if (committer?.isRetrying(room.id)) continue
      if (room.players.length > 0) {
        registry.touchActivity(room.id, now)
        continue
      }
      const lastSeen = registry.lastActivityOf(room.id) ?? now
      if (now - lastSeen > emptyRoomTtlMs(room)) {
        registry.delete(room.id)
        registry.clearActivity(room.id)
        checkpoint.discardRoom(room.id)
        committer?.retireRoom(room.id)
        console.log(`[ws-server] cleaned up empty room ${room.id}`)
      }
    }
  }, intervalMs)
}

// ── Per-connection handler ───────────────────────────────────────────────────

type ConnectionDeps = {
  registry: RoomRegistry
  persistence: RoomPersistence
  checkpoint: RoomPersistenceCheckpoint
  broadcaster: Broadcaster
  lobby: Lobby
  committer?: RoomCommitter
  gameContextStore?: GameContextStore
  activeUserSockets: Map<string, Set<WebSocket>>
}

const handleConnection = (ws: WebSocket, req: IncomingMessage, deps: ConnectionDeps): void => {
  if (!isTrustedOrigin(req)) {
    ws.close(1008, 'invalid origin')
    return
  }

  const cookieTokens = readCookies(req.headers.cookie, SESSION_COOKIE)
  const token = cookieTokens.find(candidate => validateSession(candidate)) ?? cookieTokens[0] ?? ''
  const user = validateSession(token)
  const ctx = createConnectionCtx(ws, deps, ALLOW_ANONYMOUS_WS || !!user, user?.id)
  let trackedUserId = user?.id

  const untrack = (userId: string): void => {
    const sockets = deps.activeUserSockets.get(userId)
    if (!sockets) return
    sockets.delete(ws)
    if (sockets.size === 0) deps.activeUserSockets.delete(userId)
  }

  if (trackedUserId) {
    const sockets = deps.activeUserSockets.get(trackedUserId) ?? new Set<WebSocket>()
    sockets.add(ws)
    deps.activeUserSockets.set(trackedUserId, sockets)
  }

  let authTimer: ReturnType<typeof setTimeout> | undefined
  if (!ctx.authenticated) {
    authTimer = setTimeout(() => {
      if (!ctx.authenticated) {
        deps.broadcaster.sendTo(ws, { type: 'error', error: 'authentication timeout' })
        ws.close()
      }
    }, WS_AUTH_TIMEOUT_MS)
  }

  ws.on('message', (raw: Buffer) => {
    let msg: ClientCommand
    try { msg = JSON.parse(raw.toString()) as ClientCommand } catch { return }
    if (!ctx.authenticated && msg.type !== 'auth') {
      deps.broadcaster.sendTo(ws, {
        type: 'error',
        error: 'not authenticated',
        requestId: (msg as { requestId?: string }).requestId,
      })
      return
    }
    const dispatched = dispatch(ctx, msg)
    if (dispatched instanceof Promise) {
      void dispatched.catch((error) => {
        deps.broadcaster.sendTo(ws, {
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
          requestId: (msg as { requestId?: string }).requestId,
        })
      })
    }
    if (ctx.currentUserId && ctx.currentUserId !== trackedUserId) {
      if (trackedUserId) untrack(trackedUserId)
      trackedUserId = ctx.currentUserId
      const sockets = deps.activeUserSockets.get(trackedUserId) ?? new Set<WebSocket>()
      sockets.add(ws)
      deps.activeUserSockets.set(trackedUserId, sockets)
    }
    if (ctx.authenticated && authTimer) {
      clearTimeout(authTimer)
      authTimer = undefined
    }
  })

  ws.on('close', () => {
    clearTimeout(authTimer)
    if (trackedUserId) untrack(trackedUserId)
    if (ctx.currentRoom) {
      if (!deps.committer?.hasReplay(ctx.currentRoom.id)) {
        deps.checkpoint.flushRoom(ctx.currentRoom)
      }
      const removal = removePlayerFromRoom(ctx.currentRoom, ws)
      if (removal === 'remaining') {
        deps.broadcaster.broadcastEvent(ctx.currentRoom, {
          type: 'playerDisconnected',
          playerIndex: ctx.currentPlayerIndex,
        })
      } else if (removal === 'empty') {
        if (ctx.currentRoom.session.state.gameOver && ctx.currentRoom.customSessionExecutor) {
          ctx.currentRoom.customSessionExecutor.dispose()
        }
        const now = Date.now()
        deps.registry.touchActivity(ctx.currentRoom.id, now)
        deps.gameContextStore?.setActiveExpiry(
          ctx.currentRoom.id,
          now + emptyRoomTtlMs(ctx.currentRoom),
        )
      }
    }
  })
}

// ── Public entry ─────────────────────────────────────────────────────────────

export type CreateWsServerResult = {
  wss: WebSocketServer
  registry: RoomRegistry
  broadcaster: Broadcaster
  lobby: Lobby
  checkpoint: RoomPersistenceCheckpoint
  committer?: RoomCommitter
  cleanupTimer: NodeJS.Timeout
  closeUserConnections: (userId: string) => void
  shutdown: () => void
}

export function createWsServer(
  server: HttpServer,
  deps: {
    persistence: RoomPersistence
    shouldPersist?: (room: Room) => boolean
    replay?: {
      enabled: boolean
      viewerBuildId: string
      gameBuildId: string
      viewerRoot: string
      assetRoot?: string
      cardArtRoot?: string
    }
    gameContextStore?: GameContextStore
    removedReplayAssetHashes?: ReadonlySet<string>
  },
): CreateWsServerResult {
  const registry = new RoomRegistry()
  const checkpoint = createRoomPersistenceCheckpoint({
    persistence: deps.persistence,
    shouldPersist: deps.shouldPersist,
  })
  const replay = deps.replay ?? {
    enabled:
      process.env.REPLAY_NEW_ROOMS_ENABLED === 'true' ||
      process.env.REPLAY_NEW_ROOMS_ENABLED === '1',
    viewerBuildId: process.env.REPLAY_VIEWER_BUILD_ID ?? '',
    gameBuildId: process.env.GAME_BUILD_ID ?? '',
    viewerRoot: process.env.REPLAY_VIEWER_ROOT ?? './data/replay-viewers',
    assetRoot: process.env.REPLAY_ASSET_ROOT ?? './data/replay-assets',
    cardArtRoot: process.env.CARD_ART_DIR ?? join(process.cwd(), 'data', 'card-art'),
  }
  if (replay.enabled && !(deps.persistence instanceof SqliteRoomPersistence)) {
    throw new Error('Replay recording requires SQLite persistence')
  }
  const committer = deps.persistence instanceof SqliteRoomPersistence
    ? new RoomCommitter({
        persistence: deps.persistence,
        enabled: replay.enabled,
        viewerBuildId: replay.viewerBuildId,
        gameBuildId: replay.gameBuildId,
        viewerBuildExists: (buildId) => viewerBuildExists(replay.viewerRoot, buildId),
        assetRoot: replay.assetRoot,
        cardArtRoot: replay.cardArtRoot,
        removedAssetHashes: deps.removedReplayAssetHashes,
      })
    : undefined
  const broadcaster = new Broadcaster({ checkpoint })
  const activeUserSockets = new Map<string, Set<WebSocket>>()
  const lobby = createLobby({
    registry,
    checkpoint,
    broadcaster,
    onRoomRetired: (roomId) => committer?.retireRoom(roomId),
  })

  ensureFixedDevRooms(registry, deps.persistence, checkpoint)
  restoreRooms(
    registry,
    deps.persistence,
    checkpoint,
    committer,
    deps.gameContextStore,
    Date.now(),
  )
  const cleanupTimer = startRoomCleanup(registry, checkpoint, committer)

  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (ws, req) =>
    handleConnection(ws, req, {
      registry,
      persistence: deps.persistence,
      checkpoint,
      committer,
      gameContextStore: deps.gameContextStore,
      broadcaster,
      lobby,
      activeUserSockets,
    }),
  )

  const closeUserConnections = (userId: string): void => {
    const sockets = activeUserSockets.get(userId)
    if (!sockets) return
    for (const ws of [...sockets]) {
      ws.close(1008, 'session revoked')
    }
    activeUserSockets.delete(userId)
  }

  const shutdown = (): void => {
    committer?.shutdown()
    checkpoint.shutdown()
    clearInterval(cleanupTimer)
    for (const room of registry.iter()) registry.delete(room.id)
    for (const client of wss.clients) client.close(1001, 'server shutdown')
    wss.close()
  }

  return {
    wss,
    registry,
    broadcaster,
    lobby,
    checkpoint,
    committer,
    cleanupTimer,
    closeUserConnections,
    shutdown,
  }
}
