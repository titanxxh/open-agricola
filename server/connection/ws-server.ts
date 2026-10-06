import { operationsMetrics, safe } from '../observability/metrics'
import { selectDevelopmentRoom } from '../game/development-room-slots'
import type { InvalidationOperation } from '../invalidation'
import { randomUUID } from 'node:crypto'
import { RoomAuthority } from '../game/room-authority'
import { RoomDirectory, RoomOwnershipError, RoomCapacityError } from '../game/room-directory'
import { CommandStore } from '../game/command-store'
import { getDb } from '../db'
import { enqueueRoomTask, drainRoomWork } from '../game/room-queue.ts'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
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
import { dispatch, loadCustomCardsFromDb, finishConnection } from './room-router.ts'
import type { ClientCommand } from '../../shared/contract/protocol/ws.ts'
import { readCookies, SESSION_COOKIE } from '../auth-cookies.ts'
import { validateSession } from '../auth.ts'
import { isTrustedOrigin } from '../http-origin.ts'
import { RoomCommitter } from '../game/room-committer.ts'
import { PostgresRoomPersistence } from '../game/persistence/postgres-adapter.ts'
import type { GameContextStore } from '../game/game-context-store.ts'
import { getResources } from '../storage/runtime'
import { ReplayResources } from '../storage/replay-resources'
import { allowAnonymousAccess } from '../anonymous-access.ts'

const WS_AUTH_TIMEOUT_MS = 5000
const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000

const allowAnonymousWs = (): boolean => allowAnonymousAccess()

// ── Startup helpers ──────────────────────────────────────────────────────────

const ensureFixedDevRooms = async (
  registry: RoomRegistry,
  persistence: RoomPersistence,
  checkpoint: RoomPersistenceCheckpoint,
  gameContextStore: GameContextStore | undefined,
  committer: RoomCommitter,
  authority?: RoomAuthority,
): Promise<Awaited<void>> => {
  if (process.env.NODE_ENV === 'production') return
  const startupOptions = parseFixedDevRoomStartupOptions()
  for (const { id: rootId, playerCount } of FIXED_DEV_ROOMS) {
    let owner
    let id: string
    try {
      if (authority) {
        const assignment = await authority.directory.claimDevelopment(rootId, authority.instanceId)
        id = assignment.roomId; owner = assignment.owner
      } else {
        id = await getDb().transaction(async () => {
          await getDb().exec('SELECT pg_advisory_xact_lock(973)')
          return selectDevelopmentRoom(getDb(), rootId)
        })()
      }
    } catch (error) {
      if (error instanceof RoomOwnershipError || error instanceof RoomCapacityError) continue
      throw error
    }
    if (registry.has(id)) continue
    const snap = (await persistence.load(id))
    if (!snap && await gameContextStore?.lifecycle(id) === 'active') throw new Error(`Recorded development Room metadata is missing: ${id}`)
    if (snap) {
      const room = snapshotToRoom(snap)
      room.owner = owner
      room.startedAt ??= Date.now()
      room.draftParents = startupOptions.draftParents ?? room.draftParents
      registry.set(room)
      await committer.prepareRoom(room, { missingPrefix: true })
      if (authority) await authority.directory.db.transaction(() => authority.directory.markActive(room.id, owner!))()
    } else {
      const session = new GameSession(
        undefined,
        undefined,
        buildFixedDevRoomInitialStateOptions(playerCount, startupOptions),
      )
      const room: Room = {
        id,
        owner,
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
        enableSnakeOpening: session.state.enableSnakeOpening === true,
      }
      committer.lockNewRoom(room)
      registry.set(room)
      await checkpoint.recordCreated(room)
      const prepared = await committer.prepareRoom(room, { missingPrefix: false })
      if (prepared.kind === 'blocked') throw new Error(`Cannot initialize ${room.id}: ${prepared.error}`)
    }
  }
}

const restoreRooms = async (
  registry: RoomRegistry,
  persistence: RoomPersistence,
  checkpoint: RoomPersistenceCheckpoint,
  committer: RoomCommitter | undefined,
  gameContextStore: GameContextStore | undefined,
  now: number,
): Promise<Awaited<void>> => {
  const fixedIds = FIXED_DEV_ROOMS.map((r) => r.id)
  const snapshots = (await persistence.listRestorable({
    now,
    waitingTtlMs: WAITING_EMPTY_ROOM_TTL_MS,
    playingTtlMs: PLAYING_EMPTY_ROOM_TTL_MS,
    excludeIds: fixedIds,
  }))
  ;(await committer?.cleanupReplayAssets())
  for (const snap of snapshots) {
    if (registry.has(snap.id)) continue
    const customCards = snap.meta.customCards ?? (await loadCustomCardsFromDb(
      snap.meta.customCardDbIds,
      snap.meta.createdBy ?? undefined,
    ))
    const room = snapshotToRoom(snap, customCards)
    let metaChanged = snap.meta.customCards === undefined
    if (room.status === 'waiting' && room.replayRecording !== true) {
      committer?.lockNewRoom(room)
      metaChanged = true
    }
    registry.set(room)
    if (metaChanged) (await checkpoint.recordMeta(room))
    const prepared = (await committer?.prepareRoom(room, {
      missingPrefix: room.status === 'playing',
    }))
    if (prepared?.kind === 'blocked') {
      console.warn(JSON.stringify({
        event: 'restored_room_replay_blocked',
        roomId: room.id,
        error: prepared.error,
      }))
    }
    const ttl = emptyRoomTtlMs(room)
    const persistedExpiry = (await gameContextStore?.activeExpiresAt(room.id))
    const expiresAt = persistedExpiry ?? now + ttl
    if (persistedExpiry === null) {
      ;(await gameContextStore?.setActiveExpiry(room.id, expiresAt))
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
    void (async () => {
      const now = Date.now()
      for (const room of registry.iter()) {
        if (isDevRoom(room.id)) continue
        await enqueueRoomTask(room, async () => {
          if (!registry.has(room.id) || committer?.isRetrying(room.id)) return
          if (room.players.length > 0) {
            registry.touchActivity(room.id, now)
            return
          }
          const lastSeen = registry.lastActivityOf(room.id) ?? now
          if (now - lastSeen <= emptyRoomTtlMs(room)) return
          await checkpoint.discardRoom(room.id, { owner: room.owner, expectedVersion: room.version })
          await committer?.retireRoom(room.id)
          registry.delete(room.id)
          registry.clearActivity(room.id)
          console.log(`[ws-server] cleaned up empty room ${room.id}`)
        })
      }
    })().catch(error => console.error('[ws-server] room cleanup failed', error))
  }, intervalMs)
}

// ── Per-connection handler ───────────────────────────────────────────────────

type ConnectionDeps = {
  authority?: RoomAuthority
  registry: RoomRegistry
  persistence: RoomPersistence
  checkpoint: RoomPersistenceCheckpoint
  broadcaster: Broadcaster
  lobby: Lobby
  committer?: RoomCommitter
  gameContextStore?: GameContextStore
  commands: CommandStore
  activeUserSockets: Map<string, Set<WebSocket>>
  allowAnonymous: boolean
}

const handleConnection = async (ws: WebSocket, req: IncomingMessage, deps: ConnectionDeps): Promise<Awaited<void>> => {
  if (!isTrustedOrigin(req)) {
    ws.close(1008, 'invalid origin')
    return
  }

  const buffered: Buffer[] = []
  const bufferMessage = (raw: Buffer): void => {
    if (buffered.length < 32) buffered.push(raw)
    else ws.close(1008, 'too many pending messages')
  }
  ws.on('message', bufferMessage)
  const cookieTokens = readCookies(req.headers.cookie, SESSION_COOKIE)
  let token = cookieTokens[0] ?? ''
  for (const candidate of cookieTokens) {
    if (await validateSession(candidate)) { token = candidate; break }
  }
  const user = (await validateSession(token))
  if (ws.readyState !== ws.OPEN) { ws.off('message', bufferMessage); return }
  const ctx = createConnectionCtx(ws, deps, deps.allowAnonymous || !!user, user?.id)
  ctx.sessionToken = user ? token : undefined
  deps.broadcaster.authenticate(ws, ctx.sessionToken)
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

  const onMessage = async (raw: Buffer): Promise<void> => {
    safe(() => operationsMetrics.incomingBytes.inc(raw.byteLength))
    let msg: ClientCommand
    try { msg = JSON.parse(raw.toString()) as ClientCommand } catch { safe(() => operationsMetrics.socketErrors.inc({ kind: 'parse' })); return }
    if (!ctx.authenticated && msg.type !== 'auth') {
      deps.broadcaster.sendTo(ws, {
        type: 'error',
        error: 'not authenticated',
        requestId: (msg as { requestId?: string }).requestId,
      })
      return
    }
    try {
      await dispatch(ctx, msg)
    } catch (error) {
      if (error instanceof RoomOwnershipError) { ws.close(1012, 'room owner changed'); return }
      deps.broadcaster.sendTo(ws, {
        type: 'error', error: error instanceof Error ? error.message : String(error),
        requestId: msg.requestId,
      })
      return
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
  }
  ws.off('message', bufferMessage)
  ws.on('message', onMessage)
  for (const raw of buffered) void onMessage(raw)

  ws.on('close', () => {
    void finishConnection(ctx, async () => {
    clearTimeout(authTimer)
    if (trackedUserId) untrack(trackedUserId)
    if (ctx.currentRoom && deps.registry.has(ctx.currentRoom.id)) {
      const removal = removePlayerFromRoom(ctx.currentRoom, ws)
      if (removal === 'remaining') {
        await deps.broadcaster.broadcastEvent(ctx.currentRoom, {
          type: 'playerDisconnected',
          playerIndex: ctx.currentPlayerIndex,
        })
      } else if (removal === 'empty') {
        if (ctx.currentRoom.session.state.gameOver && ctx.currentRoom.customSessionExecutor) {
          ctx.currentRoom.customSessionExecutor.dispose()
        }
        const now = Date.now()
        deps.registry.touchActivity(ctx.currentRoom.id, now)
        if (deps.authority) await deps.authority.setExpiry(ctx.currentRoom, now + emptyRoomTtlMs(ctx.currentRoom))
        else await deps.gameContextStore?.setActiveExpiry(ctx.currentRoom.id, now + emptyRoomTtlMs(ctx.currentRoom))
      }
    }
    }).catch(error => console.error('[ws-server] disconnect failed', error))
  })
}

// ── Public entry ─────────────────────────────────────────────────────────────

export type CreateWsServerResult = {
  observation: () => { users: string[]; values: Record<string, number> }
  wss: WebSocketServer
  registry: RoomRegistry
  broadcaster: Broadcaster
  lobby: Lobby
  checkpoint: RoomPersistenceCheckpoint
  committer?: RoomCommitter
  cleanupTimer: NodeJS.Timeout
  authority?: RoomAuthority
  applyInvalidation: (operation: InvalidationOperation) => Promise<void>
  closeUserConnections: (userId: string) => void
  shutdown: () => Promise<void>
}

export async function createWsServer(
  server: HttpServer,
  deps: {
    persistence: RoomPersistence
    replay?: {
      viewerBuildId: string
      gameBuildId: string
    }
    gameContextStore?: GameContextStore
    resources?: ReplayResources
    directory?: RoomDirectory
    instanceId?: string
    internalUrl?: string
  },
): Promise<Awaited<CreateWsServerResult>> {
  const registry = new RoomRegistry()
  const checkpoint = createRoomPersistenceCheckpoint({
    persistence: deps.persistence,
  })
  const replay = deps.replay ?? {
    viewerBuildId: process.env.REPLAY_VIEWER_BUILD_ID ?? '',
    gameBuildId: process.env.GAME_BUILD_ID ?? '',
  }
  if (!(deps.persistence instanceof PostgresRoomPersistence)) throw new Error('Rooms require PostgreSQL persistence')
  // Legacy cleanup belongs to the stopped-app importer, never a live node.
  const resources = deps.resources ?? new ReplayResources(getResources())
  const committer = new RoomCommitter({
        persistence: deps.persistence,
        viewerBuildId: replay.viewerBuildId,
        gameBuildId: replay.gameBuildId,
        viewerBuildExists: async (buildId) => !!await resources.viewer(buildId),
        resources,
      })
  const instanceId = deps.instanceId ?? randomUUID()
  const authority = deps.directory ? new RoomAuthority(deps.directory, instanceId, registry, deps.persistence, checkpoint, committer, deps.gameContextStore) : undefined
  const broadcaster = new Broadcaster(deps.directory)
  let heartbeatTimer: NodeJS.Timeout | undefined
  let heartbeatRunning = false
  if (authority) {
    await authority.directory.register(instanceId, deps.internalUrl ?? `http://127.0.0.1:${process.env.BACKEND_PORT ?? 5175}`, replay.gameBuildId)
    heartbeatTimer = setInterval(() => {
      if (heartbeatRunning) return
      heartbeatRunning = true
      void authority.directory.heartbeat(instanceId).then(async lost => {
        for (const id of lost) {
          const room = registry.get(id)
          if (!room) continue
          await enqueueRoomTask(room, async () => {
            for (const player of room.players) player.ws.close(1012, 'room owner changed')
            await committer.retireRoom(id)
            registry.delete(id)
            room.session.dispose()
          })
        }
      }).catch(error => {
        console.error('[ws-server] instance lease unavailable', error)
        if (error instanceof RoomOwnershipError) process.kill(process.pid, 'SIGTERM')
      }).finally(() => { heartbeatRunning = false })
    }, 5000)
    heartbeatTimer.unref()
  }
  const activeUserSockets = new Map<string, Set<WebSocket>>()
  const lobby = createLobby({
    registry,
    checkpoint,
    broadcaster,
    onRoomRetired: async (roomId) => (await committer?.retireRoom(roomId)),
  })

  ;(await ensureFixedDevRooms(registry, deps.persistence, checkpoint, deps.gameContextStore, committer, authority))
  if (authority) {
    const candidates = await authority.directory.db.prepare("SELECT id FROM rooms WHERE status IN ('waiting','playing') ORDER BY created_at, id").all<{ id: string }>()
    for (const { id } of candidates) {
      if (registry.has(id) || FIXED_DEV_ROOMS.some(room => room.id === id)) continue
      try { await authority.load(id) } catch (error) {
        if (!(error instanceof RoomOwnershipError || error instanceof RoomCapacityError)) throw error
      }
    }
    await authority.directory.activate(instanceId)
  } else {
    await restoreRooms(registry, deps.persistence, checkpoint, committer, deps.gameContextStore, Date.now())
  }
  const cleanupTimer = startRoomCleanup(registry, checkpoint, committer)

  const allowAnonymous = allowAnonymousWs()
  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (ws, req) => {
    void handleConnection(ws, req, {
      registry,
      authority,
      persistence: deps.persistence,
      checkpoint,
      committer,
      gameContextStore: deps.gameContextStore,
      broadcaster,
      lobby,
      commands: new CommandStore(getDb()),
      activeUserSockets,
      allowAnonymous,
    }).catch(error => {
      console.error('[ws-server] connection initialization failed', error)
      ws.close(1013, 'authentication unavailable')
    })
  })

  const closeUserConnections = (userId: string): void => {
    const sockets = activeUserSockets.get(userId)
    if (!sockets) return
    for (const ws of [...sockets]) {
      ws.close(1008, 'session revoked')
    }
    activeUserSockets.delete(userId)
  }

  const applyInvalidation = async (operation: InvalidationOperation): Promise<void> => {
    if (operation.kind === 'user') closeUserConnections(operation.subjectId)
    for (const room of [...registry.iter()]) {
      if (!operation.roomIds.includes(room.id)) continue
      // Release paused-command waiters and stop executable workers before
      // entering their queue, then acknowledge only after all work has drained.
      room.customSessionExecutor?.dispose()
      await committer.retireRoom(room.id)
      await enqueueRoomTask(room, async () => {
        try {
          await broadcaster.broadcastEvent(room, { type: 'roomDissolved', roomId: room.id, ...(operation.kind === 'card' ? { reason: 'card_takedown' as const } : {}) })
        } catch (error) { if (!(error instanceof RoomOwnershipError)) throw error }
        registry.delete(room.id)
        registry.clearActivity(room.id)
        for (const player of room.players) player.ws.close(1008, 'session invalidated')
        room.players = []
        room.session.dispose()
      })
    }
  }

  const shutdown = async (): Promise<Awaited<void>> => {
    clearInterval(cleanupTimer)
    clearInterval(heartbeatTimer)
    for (const client of wss.clients) {
      client.removeAllListeners('message')
      client.close(1001, 'server shutdown')
    }
    // Cancel pending retries to release their command waiters; already-running
    // transactions finish before the database and sessions are disposed.
    committer.shutdown()
    await drainRoomWork()
    if (authority) await authority.directory.stop(instanceId)
    checkpoint.shutdown()
    for (const room of registry.iter()) {
      room.session.dispose()
      registry.delete(room.id)
    }
    await new Promise<void>(resolve => wss.close(() => resolve()))
  }

  return {
    wss,
    observation: () => {
      const users = [...activeUserSockets].filter(([, sockets]) => [...sockets].some(socket => socket.readyState === socket.OPEN)).map(([user]) => user)
      return { users, values: { connections: wss.clients.size, online_users_local: users.length, ws_buffered_bytes: [...wss.clients].reduce((sum, socket) => sum + socket.bufferedAmount, 0), ...committer?.observation() } }
    },
    authority,
    registry,
    broadcaster,
    lobby,
    checkpoint,
    committer,
    cleanupTimer,
    closeUserConnections,
    applyInvalidation,
    shutdown,
  }
}
