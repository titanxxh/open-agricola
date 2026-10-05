import type { RoomWriteOptions } from './persistence/room-persistence'
import { enqueueRoomTask } from './room-queue.ts'
import type { RoomSummary, ServerEvent } from '../../shared/contract/protocol/ws.ts'
import type { RoomPersistenceCheckpoint } from './room-persistence-checkpoint.ts'
import { RoomRegistry } from './room-registry.ts'
import {
  isDevRoom,
  summarizeRoomsForLobby,
  type Room,
} from './room.ts'

export type RoomBroadcaster = {
  broadcastEvent(room: Room, event: ServerEvent): void | Promise<void>
}

export type Lobby = {
  getRooms(limit?: number): RoomSummary[]
  dissolveRoomById(roomId: string, userId: string | undefined, options?: RoomWriteOptions): Promise<{ ok: boolean; error?: string }>
  endRoomsForUser(userId: string, affectedRoomIds?: readonly string[]): Promise<{ endedRoomIds: string[] }>
  endRoomsUsingCard(cardDbId: string): Promise<{ endedRoomIds: string[] }>
}

export function createLobby(deps: {
  registry: RoomRegistry
  checkpoint: RoomPersistenceCheckpoint
  broadcaster: RoomBroadcaster
  onRoomRetired?: (roomId: string) => void | Promise<void>
}): Lobby {
  const { registry, checkpoint, broadcaster, onRoomRetired } = deps
  const retire = async (room: Room, reason?: 'card_takedown', options?: RoomWriteOptions): Promise<void> => {
    await checkpoint.discardRoom(room.id, { owner: room.owner, expectedVersion: room.version, ...options })
    await onRoomRetired?.(room.id)
    const players = room.players
    await broadcaster.broadcastEvent(room, { type: 'roomDissolved', roomId: room.id, ...(reason ? { reason } : {}) })
    room.players = []
    registry.delete(room.id)
    registry.clearActivity(room.id)
    for (const player of players) {
      try { player.ws.close() } catch { /* transport already closed */ }
    }
  }
  return {
    getRooms(limit?: number) {
      return summarizeRoomsForLobby(registry.iter(), limit)
    },
    async dissolveRoomById(roomId, userId, options) {
      const room = registry.get(roomId)
      if (!room) return { ok: false, error: 'room not found' }
      return enqueueRoomTask(room, async () => {
        if (!registry.has(roomId)) return { ok: false, error: 'room not found' }
        if (isDevRoom(room.id)) return { ok: false, error: 'cannot dissolve dev room' }
        if (room.createdBy !== userId) return { ok: false, error: 'only the room creator can dissolve' }
        await retire(room, undefined, options)
        return { ok: true }
      })
    },
    async endRoomsUsingCard(cardDbId) {
      // Admin kill switch (#641): terminate every running game that embeds
      // the card. Dev rooms are not spared — the whole point is that the
      // card's code must stop executing.
      const endedRoomIds: string[] = []
      for (const room of [...registry.iter()]) {
        if (!room.customCardDbIds?.includes(cardDbId)) continue
        await enqueueRoomTask(room, async () => {
          if (registry.has(room.id)) await retire(room, 'card_takedown')
        })
        endedRoomIds.push(room.id)
      }
      return { endedRoomIds }
    },
    async endRoomsForUser(userId, affectedRoomIds = []) {
      const endedRoomIds: string[] = []
      const affected = new Set(affectedRoomIds)
      for (const room of [...registry.iter()]) {
        if (isDevRoom(room.id)) continue
        const belongsToUser = affected.has(room.id) ||
          room.createdBy === userId ||
          room.players.some((player) => player.userId === userId) ||
          room.seatOwners?.some((owner) => owner.userId === userId)
        if (!belongsToUser) continue
        await enqueueRoomTask(room, async () => {
          if (registry.has(room.id)) await retire(room)
        })
        endedRoomIds.push(room.id)
      }
      return { endedRoomIds }
    },
  }
}
