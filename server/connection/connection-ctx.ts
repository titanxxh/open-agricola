import type { WebSocket } from 'ws'
import type { Room } from '../game/room.ts'
import type { RoomRegistry } from '../game/room-registry.ts'
import type { RoomPersistence } from '../game/persistence/room-persistence.ts'
import type { Broadcaster } from './broadcaster.ts'
import type { Lobby } from '../game/lobby.ts'

export type ConnectionDeps = {
  registry: RoomRegistry
  persistence: RoomPersistence
  broadcaster: Broadcaster
  lobby: Lobby
}

export type ConnectionCtx = {
  ws: WebSocket
  authenticated: boolean
  currentUserId: string | undefined
  currentRoom: Room | null
  currentPlayerIndex: number
} & ConnectionDeps

export const createConnectionCtx = (
  ws: WebSocket,
  deps: ConnectionDeps,
  initialAuthenticated: boolean,
  currentUserId?: string,
): ConnectionCtx => ({
  ws,
  authenticated: initialAuthenticated,
  currentUserId,
  currentRoom: null,
  currentPlayerIndex: -1,
  ...deps,
})
