import type { ExperimentalFeatureAccess } from '../experimental-features'
import type { RoomAuthority } from '../game/room-authority'
import type { OwnerToken } from '../game/room-directory'
import type { CommandStore, CommandRequest } from '../game/command-store'
import type { CommandOutcome } from '../../shared/contract/protocol/commands'
import type { WebSocket } from 'ws'
import type { Room } from '../game/room.ts'
import { controlledSeatIndexes } from '../game/room-viewer'
import type { RoomRegistry } from '../game/room-registry.ts'
import type { RoomPersistenceCheckpoint } from '../game/room-persistence-checkpoint.ts'
import type { Broadcaster } from './broadcaster.ts'
import type { Lobby } from '../game/lobby.ts'
import type { RoomCommitter } from '../game/room-committer.ts'
import type { GameContextStore } from '../game/game-context-store.ts'

export type ConnectionDeps = {
  experimentalFeatureAccess?: ExperimentalFeatureAccess
  authority?: RoomAuthority
  commands?: CommandStore
  registry: RoomRegistry
  checkpoint: RoomPersistenceCheckpoint
  broadcaster: Broadcaster
  lobby: Lobby
  committer?: RoomCommitter
  gameContextStore?: GameContextStore
}

export type ConnectionCtx = {
  activeCommand?: { request: CommandRequest; owner?: OwnerToken; outcome?: CommandOutcome }
  ws: WebSocket
  sessionToken?: string
  authenticated: boolean
  currentUserId: string | undefined
  currentRoom: Room | null
  currentPlayerIndex: number
  controlledPlayerIndices: ReadonlySet<number>
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
  controlledPlayerIndices: new Set(),
  ...deps,
})

export const refreshConnectionSeat = (ctx: ConnectionCtx): void => {
  const room = ctx.currentRoom
  const seats = room?.players.filter(player => player.ws === ctx.ws) ?? []
  if (room && seats.length > 0) {
    ctx.currentPlayerIndex = seats[0]!.playerIndex
  }
  ctx.controlledPlayerIndices = new Set(room ? controlledSeatIndexes(room, ctx.ws) : [])
}
