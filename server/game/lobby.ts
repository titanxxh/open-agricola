import type { RoomSummary, ServerEvent } from '../../shared/contract/protocol/ws.ts'
import type { RoomPersistenceCheckpoint } from './room-persistence-checkpoint.ts'
import { RoomRegistry } from './room-registry.ts'
import {
  isDevRoom,
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
  endRoomsUsingCard(cardDbId: string): { endedRoomIds: string[] }
}

export function createLobby(deps: {
  registry: RoomRegistry
  checkpoint: RoomPersistenceCheckpoint
  broadcaster: RoomBroadcaster
  onRoomRetired?: (roomId: string) => void
}): Lobby {
  const { registry, checkpoint, broadcaster, onRoomRetired } = deps
  return {
    getRooms(limit?: number) {
      return summarizeRoomsForLobby(registry.iter(), limit)
    },
    dissolveRoomById(roomId, userId) {
      const room = registry.get(roomId)
      if (!room) return { ok: false, error: 'room not found' }
      if (isDevRoom(room.id)) return { ok: false, error: 'cannot dissolve dev room' }
      if (room.createdBy !== userId) return { ok: false, error: 'only the room creator can dissolve' }
      broadcaster.broadcastEvent(room, { type: 'roomDissolved', roomId: room.id })
      for (const p of room.players) {
        try { p.ws.close() } catch { }
      }
      registry.delete(roomId)
      registry.clearActivity(roomId)
      checkpoint.discardRoom(roomId)
      onRoomRetired?.(roomId)
      return { ok: true }
    },
    endRoomsUsingCard(cardDbId) {
      // Admin kill switch (#641): terminate every running game that embeds
      // the card. Dev rooms are not spared — the whole point is that the
      // card's code must stop executing.
      const endedRoomIds: string[] = []
      for (const room of [...registry.iter()]) {
        if (!room.customCardDbIds?.includes(cardDbId)) continue
        // A finished game executes no further card code and its replay is
        // already archived as completed — leave it to the empty-room TTL.
        if (room.session.state.gameOver) continue
        broadcaster.broadcastEvent(room, {
          type: 'roomDissolved',
          roomId: room.id,
          reason: 'card_takedown',
        })
        for (const p of room.players) {
          try { p.ws.close() } catch { /* ignore close errors */ }
        }
        registry.delete(room.id)
        registry.clearActivity(room.id)
        checkpoint.discardRoom(room.id)
        onRoomRetired?.(room.id)
        endedRoomIds.push(room.id)
      }
      return { endedRoomIds }
    },
    endRoomsForUser(userId, affectedRoomIds = []) {
      const endedRoomIds: string[] = []
      const affected = new Set(affectedRoomIds)
      for (const room of [...registry.iter()]) {
        if (isDevRoom(room.id)) continue
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
        onRoomRetired?.(room.id)
        endedRoomIds.push(room.id)
      }
      return { endedRoomIds }
    },
  }
}
