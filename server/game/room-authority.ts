import { ExecutionAccess } from './execution-access'
import { RoomDirectory, RoomOwnershipError, type OwnerToken } from './room-directory'
import type { RoomRegistry } from './room-registry'
import type { PostgresRoomPersistence } from './persistence/postgres-adapter'
import type { RoomPersistenceCheckpoint } from './room-persistence-checkpoint'
import type { RoomCommitter } from './room-committer'
import type { GameContextStore } from './game-context-store'
import { emptyRoomTtlMs, isDevRoom, roomOccupiedSeatCount, snapshotToRoom, type Room } from './room'

/** Loads only this process's assigned rooms. GameSession remains the state owner. */
export class RoomAuthority {
  private readonly loading = new Map<string, Promise<Room | undefined>>()
  readonly directory: RoomDirectory
  readonly instanceId: string
  private readonly registry: RoomRegistry
  private readonly persistence: PostgresRoomPersistence
  private readonly checkpoint: RoomPersistenceCheckpoint
  private readonly committer: RoomCommitter
  private readonly contexts?: GameContextStore
  constructor(directory: RoomDirectory, instanceId: string, registry: RoomRegistry,
    persistence: PostgresRoomPersistence, checkpoint: RoomPersistenceCheckpoint,
    committer: RoomCommitter, contexts?: GameContextStore) {
    this.directory = directory; this.instanceId = instanceId; this.registry = registry
    this.persistence = persistence; this.checkpoint = checkpoint
    this.committer = committer; this.contexts = contexts
  }

  async assert(room: Room): Promise<void> {
    if (!room.owner) throw new RoomOwnershipError('Room has no owner')
    await this.directory.db.transaction(async () => {
      await this.directory.assertOwner(room.id, room.owner!)
      if (room.executionStamp) await new ExecutionAccess(this.directory.db).assert(room.executionStamp)
    })()
  }

  async claim(roomId: string): Promise<OwnerToken> {
    return (await this.directory.claim(roomId, this.instanceId, isDevRoom(roomId))).owner
  }

  async load(roomId: string): Promise<Room | undefined> {
    const existing = this.registry.get(roomId)
    if (existing) { await this.assert(existing); return existing }
    const pending = this.loading.get(roomId)
    if (pending) return pending
    const work = this.loadOwned(roomId)
    this.loading.set(roomId, work)
    try { return await work } finally { this.loading.delete(roomId) }
  }

  private async loadOwned(roomId: string): Promise<Room | undefined> {
    const lifecycle = await this.contexts?.lifecycle(roomId)
    if (lifecycle && lifecycle !== 'active') return undefined
    const owner = await this.claim(roomId)
    const snap = await this.persistence.load(roomId)
    if (!snap) return undefined
    const room = snapshotToRoom(snap)
    try {
      room.owner = owner
      room.executionStamp = await new ExecutionAccess(this.directory.db).capture(room.customCardDbIds ?? [], [room.createdBy, ...(room.seatOwners ?? []).map(seat => seat.userId)].filter((id): id is string => !!id))
      if (room.status === 'waiting' && room.replayRecording !== true) {
        this.committer.lockNewRoom(room)
        await this.checkpoint.recordMeta(room)
      }
      const result = await this.committer.prepareRoom(room, { missingPrefix: room.status === 'playing' })
      if (result.kind === 'blocked') console.warn(JSON.stringify({ event: 'restored_room_replay_blocked', roomId, error: result.error }))
      await this.directory.db.transaction(() => this.directory.markActive(room.id, owner))()
      const ttl = emptyRoomTtlMs(room)
      const persistedExpiry = await this.contexts?.activeExpiresAt(room.id)
      const expiresAt = persistedExpiry ?? Date.now() + ttl
      if (persistedExpiry === null) await this.setExpiry(room, expiresAt)
      this.registry.set(room)
      this.registry.touchActivity(room.id, expiresAt - ttl)
      console.log(`[ws-server] restored owned room ${room.id}`)
      return room
    } catch (error) {
      room.customSessionExecutor?.dispose()
      room.session.dispose()
      throw error
    }
  }

  async setExpiry(room: Room, expiresAt: number): Promise<void> {
    await this.directory.db.transaction(async () => {
      await this.directory.assertOwner(room.id, room.owner!)
      await this.directory.presence(room.id, room.owner!, room.players.length, roomOccupiedSeatCount(room))
      await this.contexts?.setActiveExpiry(room.id, expiresAt)
    })()
  }
}
