import { serializeSessionSnapshot } from '../../shared/session/serialization.ts'
import { Scoring } from '../../shared/domain/scoring.ts'
import { toRoomMeta, type Room } from './room.ts'
import type { GameResult, RoomPersistence, RoomWriteOptions } from './persistence/room-persistence.ts'

export const buildGameResult = (room: Room, finishedAt: number): GameResult => {
  const state = room.session.state
  const scores = room.customSessionExecutor?.scoresForPersistence()
    ?? Scoring.computeAll(state)
  const seatOwners = new Map(
    toRoomMeta(room).players.map((player) => [player.playerIndex, player.userId]),
  )
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
    snakeOpening: state.enableSnakeOpening === true,
    players: scores.map((score, playerIndex) => ({
      playerIndex,
      gamePlayerId: score.playerId,
      userId: seatOwners.get(playerIndex) ?? null,
      displayName: score.playerName,
      ...(state.players.find((player) => player.id === score.playerId)?.nameIsDefault
        ? { nameIsDefault: true } : {}),
      score: score.total,
    })),
  }
}


/** Waiting-room and seat metadata are acknowledged only after durable storage. */
export class RoomPersistenceCheckpoint {
  private readonly persistence: RoomPersistence
  private readonly inactiveRoomIds = new Set<string>()
  private disposed = false

  constructor(deps: { persistence: RoomPersistence }) {
    this.persistence = deps.persistence
  }

  async recordCreated(room: Room, options?: RoomWriteOptions): Promise<void> {
    this.assertWritable(room.id)
    await this.persistence.save(room.id, serializeSessionSnapshot(room.session.state, room.session), toRoomMeta(room), { executionStamp: room.executionStamp, owner: room.owner, expectedVersion: null, ...options })
  }

  async recordMeta(room: Room, options?: RoomWriteOptions): Promise<void> {
    this.assertWritable(room.id)
    await this.persistence.save(room.id, room.status === 'waiting' ? serializeSessionSnapshot(room.session.state, room.session) : null, toRoomMeta(room), { executionStamp: room.executionStamp, owner: room.owner, expectedVersion: room.version, ...options })
  }

  markInactive(roomId: string): void {
    this.inactiveRoomIds.add(roomId)
  }

  async discardRoom(roomId: string, options?: RoomWriteOptions): Promise<void> {
    await this.persistence.discard(roomId, options)
    this.markInactive(roomId)
  }

  async hasRoomId(roomId: string): Promise<boolean> {
    return this.inactiveRoomIds.has(roomId) || await this.persistence.hasRoomId(roomId)
  }

  shutdown(): void {
    this.disposed = true
  }

  private assertWritable(roomId: string): void {
    if (this.disposed || this.inactiveRoomIds.has(roomId)) throw new Error('Room metadata is no longer writable')
  }
}

export const createRoomPersistenceCheckpoint = (
  deps: ConstructorParameters<typeof RoomPersistenceCheckpoint>[0],
): RoomPersistenceCheckpoint => new RoomPersistenceCheckpoint(deps)
