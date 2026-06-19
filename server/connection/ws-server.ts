import type { Server as HttpServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { GameSession } from '../game/authoritative-session.ts'
import { RoomRegistry } from '../game/room-registry.ts'
import {
  FIXED_DEV_ROOMS,
  PLAYING_EMPTY_ROOM_TTL_MS,
  WAITING_EMPTY_ROOM_TTL_MS,
  buildFixedDevRoomInitialStateOptions,
  emptyRoomTtlMs,
  isFixedDevRoom,
  parseFixedDevRoomStartupOptions,
  removePlayerFromRoom,
  snapshotToRoom,
  type Room,
} from '../game/room.ts'
import { createLobby, type Lobby } from '../game/lobby.ts'
import type { RoomPersistence } from '../game/persistence/room-persistence.ts'
import { Broadcaster } from './broadcaster.ts'
import { createConnectionCtx } from './connection-ctx.ts'
import { dispatch } from './room-router.ts'
import type { ClientCommand } from '../../shared/contract/protocol/ws.ts'

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
): void => {
  if (process.env.NODE_ENV === 'production') return
  const startupOptions = parseFixedDevRoomStartupOptions()
  for (const { id, playerCount } of FIXED_DEV_ROOMS) {
    if (registry.has(id)) continue
    const snap = persistence.load(id)
    if (snap) {
      registry.set(snapshotToRoom(snap))
    } else {
      const session = new GameSession(
        undefined,
        undefined,
        buildFixedDevRoomInitialStateOptions(playerCount, startupOptions),
      )
      registry.set({
        id,
        session,
        players: [],
        maxPlayers: playerCount,
        version: 0,
        status: 'playing',
        enableParentCards: session.state.enableParentCards,
      })
    }
  }
}

const restoreRooms = (
  registry: RoomRegistry,
  persistence: RoomPersistence,
  now: number,
): void => {
  const fixedIds = FIXED_DEV_ROOMS.map((r) => r.id)
  const snapshots = persistence.listRestorable({
    now,
    waitingTtlMs: WAITING_EMPTY_ROOM_TTL_MS,
    playingTtlMs: PLAYING_EMPTY_ROOM_TTL_MS,
    excludeIds: fixedIds,
  })
  for (const snap of snapshots) {
    if (registry.has(snap.id)) continue
    const room = snapshotToRoom(snap)
    registry.set(room)
    if (snap.updatedAt > 0) registry.touchActivity(snap.id, snap.updatedAt)
    console.log(`[ws-server] restored room ${snap.id}`)
  }
}

const startRoomCleanup = (
  registry: RoomRegistry,
  persistence: RoomPersistence,
  intervalMs: number = ROOM_CLEANUP_INTERVAL_MS,
): NodeJS.Timeout => {
  return setInterval(() => {
    const now = Date.now()
    for (const room of registry.iter()) {
      if (isFixedDevRoom(room.id)) continue
      if (room.players.length > 0) {
        registry.touchActivity(room.id, now)
        continue
      }
      const lastSeen = registry.lastActivityOf(room.id) ?? now
      if (now - lastSeen > emptyRoomTtlMs(room)) {
        registry.delete(room.id)
        registry.clearActivity(room.id)
        persistence.markFinished(room.id, now)
        console.log(`[ws-server] cleaned up empty room ${room.id}`)
      }
    }
  }, intervalMs)
}

// ── Per-connection handler ───────────────────────────────────────────────────

type ConnectionDeps = {
  registry: RoomRegistry
  persistence: RoomPersistence
  broadcaster: Broadcaster
  lobby: Lobby
}

const handleConnection = (ws: WebSocket, deps: ConnectionDeps): void => {
  const ctx = createConnectionCtx(ws, deps, ALLOW_ANONYMOUS_WS)

  let authTimer: ReturnType<typeof setTimeout> | undefined
  if (!ALLOW_ANONYMOUS_WS) {
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
    dispatch(ctx, msg)
    if (ctx.authenticated && authTimer) {
      clearTimeout(authTimer)
      authTimer = undefined
    }
  })

  ws.on('close', () => {
    clearTimeout(authTimer)
    if (ctx.currentRoom) {
      const removal = removePlayerFromRoom(ctx.currentRoom, ws)
      if (removal === 'remaining') {
        deps.broadcaster.broadcastEvent(ctx.currentRoom, {
          type: 'playerDisconnected',
          playerIndex: ctx.currentPlayerIndex,
        })
      } else if (removal === 'empty') {
        deps.registry.touchActivity(ctx.currentRoom.id, Date.now())
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
  cleanupTimer: NodeJS.Timeout
}

export function createWsServer(
  server: HttpServer,
  deps: {
    persistence: RoomPersistence
    shouldPersist?: (room: Room) => boolean
  },
): CreateWsServerResult {
  const registry = new RoomRegistry()
  const broadcaster = new Broadcaster({
    persistence: deps.persistence,
    shouldPersist: deps.shouldPersist,
  })
  const lobby = createLobby({ registry, persistence: deps.persistence, broadcaster })

  ensureFixedDevRooms(registry, deps.persistence)
  restoreRooms(registry, deps.persistence, Date.now())
  const cleanupTimer = startRoomCleanup(registry, deps.persistence)

  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (ws) =>
    handleConnection(ws, {
      registry,
      persistence: deps.persistence,
      broadcaster,
      lobby,
    }),
  )

  return { wss, registry, broadcaster, lobby, cleanupTimer }
}
