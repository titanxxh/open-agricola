import type { RoomSummary, ServerEvent } from '../../shared/contract/protocol/ws.ts'
import type { RoomPersistenceCheckpoint } from './room-persistence-checkpoint.ts'
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
  endRoomsForUser(userId: string, affectedRoomIds?: readonly string[]): { endedRoomIds: string[] }
}

export function createLobby(deps: {
  registry: RoomRegistry
  checkpoint: RoomPersistenceCheckpoint
  broadcaster: RoomBroadcaster
}): Lobby {
  const { registry, checkpoint, broadcaster } = deps
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
      checkpoint.discardRoom(roomId)
      return { ok: true }
    },
    endRoomsForUser(userId, affectedRoomIds = []) {
      const endedRoomIds: string[] = []
      const affected = new Set(affectedRoomIds)
      for (const room of [...registry.iter()]) {
        if (isFixedDevRoom(room.id)) continue
        const belongsToUser = affected.has(room.id) ||
          room.createdBy === userId ||
          room.players.some((player) => player.userId === userId) ||
          room.seatOwners?.some((owner) => owner.userId === userId)
        if (!belongsToUser) continue
        broadcaster.broadcastEvent(room, { type: 'roomDissolved', roomId: room.id })
        for (const p of room.players) {
          try { p.ws.close() } catch { /* ignore close errors */ }
        }
        registry.delete(room.id)
        registry.clearActivity(room.id)
        checkpoint.discardRoom(room.id)
        endedRoomIds.push(room.id)
      }
      return { endedRoomIds }
    },
  }
}
