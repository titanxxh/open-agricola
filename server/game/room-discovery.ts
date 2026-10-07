import type { RoomDiscoveryRequest, RoomDiscoveryResponse } from '../../shared/contract/protocol/routing'
import { CommandStore } from './command-store'
import { RoomDirectory, RoomOwnershipError } from './room-directory'

/** Discovery supplies a route, never seat permission or a gameplay write. */
export async function discoverRoom(directory: RoomDirectory, actorId: string, request: RoomDiscoveryRequest): Promise<RoomDiscoveryResponse> {
  let roomId = request.roomId
  if (request.pendingIdentity) {
    const pending = await new CommandStore(directory.db).lookup(actorId, request.pendingIdentity)
    if (pending.kind === 'completed') {
      if (!pending.receipt.outcome.ok && !pending.receipt.outcome.roomId && !roomId) {
        const instance = (await directory.instances())[0]
        if (!instance) throw new RoomOwnershipError('No application instance is available')
        return { wsPath: `/nodes/${instance.instance_id}/ws` }
      }
      roomId = pending.receipt.outcome.roomId ?? roomId
    } else if (pending.kind === 'pending') {
      const resultId = pending.request.resultRoomId
      const committed = resultId && await directory.db.prepare('SELECT 1 FROM game_contexts WHERE room_id=?').get(resultId)
      roomId = committed ? resultId! : pending.request.targetRoomId ?? roomId
    }
  }
  if (roomId) {
    if (typeof roomId !== 'string' || roomId.length > 128 || !/^[A-Za-z0-9-]+$/.test(roomId)) throw Object.assign(new Error('Invalid game context'), { code: 'invalid_context_link' })
    if (request.developmentSlot === true && !request.pendingIdentity && process.env.NODE_ENV !== 'production' && /^dev[2-6]$/.test(roomId)) {
      const slot = await directory.db.prepare('SELECT room_id FROM development_room_slots WHERE root_id=?').get<{ room_id: string }>(roomId)
      roomId = slot?.room_id ?? roomId
    }
    const context = await directory.db.prepare('SELECT lifecycle FROM game_contexts WHERE room_id=?').get<{ lifecycle: string }>(roomId)
    if (!context) throw Object.assign(new Error('Game context was not found'), { code: 'unknown_context' })
    if (context.lifecycle !== 'active') {
      // A pending command must still be able to read its completed receipt even
      // after the final game transition retired the active context.
      if (request.pendingIdentity) {
        const instance = (await directory.instances())[0]
        if (instance) return { roomId, wsPath: `/nodes/${instance.instance_id}/ws` }
      }
      throw Object.assign(new Error('Game context changed'), { code: 'context_changed' })
    }
    const assigned = await directory.claim(roomId)
    return { roomId, wsPath: assigned.wsPath }
  }
  if (!request.allocationId) throw new RoomOwnershipError('A creation allocation identity is required')
  const allocation = await directory.allocate(actorId, request.allocationId)
  return { allocationId: allocation.allocationId, wsPath: allocation.wsPath }
}
