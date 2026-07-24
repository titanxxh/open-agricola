import { serializeState } from '../../shared/session/serialization.ts'
import { Scoring } from '../../shared/domain/scoring.ts'
import { toRoomMeta, type Room } from './room.ts'
import type {
  GameResult,
  RoomCompletionResult,
  RoomPersistence,
} from './persistence/room-persistence.ts'

const FLUSH_DELAY_MS = 1000

export type RoomCheckpointScheduler = {
  setTimeout(callback: () => void, delay: number): unknown
  clearTimeout(handle: unknown): void
}

const scheduler: RoomCheckpointScheduler = {
  setTimeout(callback, delay) {
    const timer = setTimeout(callback, delay)
    timer.unref()
    return timer
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
}

export class RoomPersistenceCheckpoint {
  private readonly persistence: RoomPersistence
  private readonly shouldPersist: (room: Room) => boolean
  private readonly scheduler: RoomCheckpointScheduler
  private readonly now: () => number
  private readonly dirtyRooms = new Map<string, Room>()
  private readonly inactiveRoomIds = new Set<string>()
  private timer: unknown | null = null
  private disposed = false

  constructor(deps: {
    persistence: RoomPersistence
    shouldPersist?: (room: Room) => boolean
    scheduler?: RoomCheckpointScheduler
    now?: () => number
  }) {
    this.persistence = deps.persistence
    this.shouldPersist = deps.shouldPersist ?? (() => true)
    this.scheduler = deps.scheduler ?? scheduler
    this.now = deps.now ?? Date.now
  }

  recordCreated(room: Room): void {
    if (!this.canPersist(room)) return
    this.persistence.save(room.id, null, toRoomMeta(room))
    this.recordState(room)
  }

  recordMeta(room: Room): void {
    if (!this.canPersist(room)) return
    this.persistence.save(room.id, null, toRoomMeta(room))
  }

  recordState(room: Room): void {
    if (!this.canPersist(room)) return
    this.dirtyRooms.set(room.id, room)
    this.scheduleFlush()
  }

  flushRoom(room: Room): void {
    if (!this.canPersist(room)) return
    this.dirtyRooms.delete(room.id)
    this.cancelTimerIfIdle()
    this.saveState(room)
  }

  flushAll(): void {
    if (this.disposed || this.dirtyRooms.size === 0) return
    this.cancelTimer()
    const rooms = [...this.dirtyRooms.values()]
    this.dirtyRooms.clear()
    for (const room of rooms) {
      if (!this.canPersist(room)) continue
      try {
        this.saveState(room)
      } catch (err) {
        this.dirtyRooms.set(room.id, room)
        console.warn('[room-persistence-checkpoint] flush failed:', err)
      }
    }
    this.scheduleFlush()
  }

  cancelRoom(roomId: string): void {
    this.dirtyRooms.delete(roomId)
    this.cancelTimerIfIdle()
  }

  completeGame(room: Room, finishedAt: number = this.now()): RoomCompletionResult {
    this.cancelRoom(room.id)
    if (this.inactiveRoomIds.has(room.id)) {
      return { ok: true, archived: this.persistence.hasRoomId(room.id) }
    }
    if (!room.session.state.gameOver) return { ok: false, error: 'game is not over' }
    let result: RoomCompletionResult
    try {
      if (this.shouldPersist(room)) this.saveState(room)
      if (room.startedAt === undefined) return { ok: false, error: 'game start time is missing' }
      result = this.persistence.complete(this.buildResult(room, finishedAt))
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    if (result.ok) {
      this.inactiveRoomIds.add(room.id)
    } else {
      console.warn('[room-persistence-checkpoint] completion failed:', result.error)
    }
    return result
  }

  discardRoom(roomId: string): void {
    this.cancelRoom(roomId)
    this.inactiveRoomIds.add(roomId)
    this.persistence.discard(roomId)
  }

  hasRoomId(roomId: string): boolean {
    return this.inactiveRoomIds.has(roomId) || this.persistence.hasRoomId(roomId)
  }

  shutdown(): void {
    if (this.disposed) return
    this.flushAll()
    this.disposed = true
    this.cancelTimer()
  }

  private saveState(room: Room): void {
    this.persistence.save(
      room.id,
      serializeState(room.session.state, { engineStack: room.session.getEngineStack() }),
      toRoomMeta(room),
    )
  }

  private buildResult(room: Room, finishedAt: number): GameResult {
    const state = room.session.state
    const scores = Scoring.computeAll(state)
    return {
      roomId: room.id,
      startedAt: room.startedAt!,
      finishedAt,
      roundsPlayed: Math.max(0, Math.min(state.round, 14)),
      playerCount: state.players.length,
      communityDeck: state.enableCommunityDeck,
      parentCards: state.enableParentCards,
      throughTheSeasons: state.enableThroughTheSeasons,
      farmersOfTheMoor: state.enableFarmersOfTheMoor === true,
      players: scores.map((score, playerIndex) => ({
        playerIndex,
        gamePlayerId: score.playerId,
        userId: room.players.find((player) => player.playerIndex === playerIndex)?.userId ?? null,
        displayName: score.playerName,
        score: score.total,
      })),
    }
  }

  private canPersist(room: Room): boolean {
    return !this.disposed &&
      !this.inactiveRoomIds.has(room.id) &&
      this.shouldPersist(room)
  }

  private scheduleFlush(): void {
    if (this.disposed || this.timer !== null || this.dirtyRooms.size === 0) return
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null
      this.flushAll()
    }, FLUSH_DELAY_MS)
  }

  private cancelTimerIfIdle(): void {
    if (this.dirtyRooms.size === 0) this.cancelTimer()
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    this.scheduler.clearTimeout(this.timer)
    this.timer = null
  }
}

export const createRoomPersistenceCheckpoint = (
  deps: ConstructorParameters<typeof RoomPersistenceCheckpoint>[0],
): RoomPersistenceCheckpoint => new RoomPersistenceCheckpoint(deps)
