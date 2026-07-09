import type { GameState } from '../../shared/contract/types.ts'
import { serializeState } from '../../shared/session/serialization.ts'
import { toRoomMeta, type Room } from './room.ts'
import type { RoomPersistence } from './persistence/room-persistence.ts'

export class RoomPersistenceCheckpoint {
  private readonly persistence: RoomPersistence
  private readonly shouldPersist: (room: Room) => boolean

  constructor(deps: {
    persistence: RoomPersistence
    shouldPersist?: (room: Room) => boolean
  }) {
    this.persistence = deps.persistence
    this.shouldPersist = deps.shouldPersist ?? (() => true)
  }

  recordCreated(room: Room): void {
    if (!this.shouldPersist(room)) return
    this.persistence.save(room.id, null, toRoomMeta(room))
    this.recordState(room)
  }

  recordMeta(room: Room): void {
    if (!this.shouldPersist(room)) return
    this.persistence.save(room.id, null, toRoomMeta(room))
  }

  recordState(room: Room, state: GameState = room.session.getState().state): void {
    if (!this.shouldPersist(room)) return
    this.persistence.save(
      room.id,
      serializeState(state, { engineStack: room.session.getEngineStack() }),
      toRoomMeta(room),
    )
  }

  recordFinished(roomId: string, now: number = Date.now()): void {
    this.persistence.markFinished(roomId, now)
  }

  deleteRoom(roomId: string): void {
    this.persistence.delete(roomId)
  }
}

export const createRoomPersistenceCheckpoint = (
  deps: ConstructorParameters<typeof RoomPersistenceCheckpoint>[0],
): RoomPersistenceCheckpoint => new RoomPersistenceCheckpoint(deps)
