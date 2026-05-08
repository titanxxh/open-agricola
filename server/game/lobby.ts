import type { RoomSummary, ServerEvent } from '../../shared/contract/protocol/ws.ts'
import type { RoomPersistence } from './persistence/room-persistence.ts'
import { RoomRegistry } from './room-registry.ts'
import {
  isFixedDevRoom,
  summarizeRoomsForLobby,
  type Room,
} from './room.ts'

export type RoomBroadcaster = {
  broadcastEvent(room: Room, event: ServerEvent): void
}

export type Lobby = {
  getRooms(limit?: number): RoomSummary[]
  dissolveRoomById(roomId: string, userId: string | undefined): { ok: boolean; error?: string }
}

export function createLobby(deps: {
  registry: RoomRegistry
  persistence: RoomPersistence
  broadcaster: RoomBroadcaster
}): Lobby {
  const { registry, persistence, broadcaster } = deps
  return {
    getRooms(limit?: number) {
      return summarizeRoomsForLobby(registry.iter(), limit)
    },
    dissolveRoomById(roomId, userId) {
      const room = registry.get(roomId)
      if (!room) return { ok: false, error: 'room not found' }
      if (isFixedDevRoom(room.id)) return { ok: false, error: 'cannot dissolve dev room' }
      if (room.createdBy !== userId) return { ok: false, error: 'only the room creator can dissolve' }
      broadcaster.broadcastEvent(room, { type: 'roomDissolved', roomId: room.id })
      for (const p of room.players) {
        try { p.ws.close() } catch { }
      }
      registry.delete(roomId)
      registry.clearActivity(roomId)
      persistence.delete(roomId)
      return { ok: true }
    },
  }
}
