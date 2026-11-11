import { ExecutionAccess } from './execution-access'
import { RoomDirectory, RoomOwnershipError, type OwnerToken } from './room-directory'
import type { RoomRegistry } from './room-registry'
import type { PostgresRoomPersistence } from './persistence/postgres-adapter'
import type { RoomPersistenceCheckpoint } from './room-persistence-checkpoint'
import type { RoomCommitter } from './room-committer'
import type { GameContextStore } from './game-context-store'
import { isDevRoom, roomConnectedPlayerCount, roomOccupiedSeatCount, snapshotToRoom, type Room } from './room'
import { enqueueRoomTask } from './room-queue'

const OFFLINE_CACHE_TTL_MS = 30 * 60 * 1000

/** Loads only this process's assigned rooms. GameSession remains the state owner. */
export class RoomAuthority {
  private readonly loading = new Map<string, Promise<Room | undefined>>()
  private readonly pins = new Map<string, number>()
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

  async withRooms<T>(ids: readonly string[], work: () => T | Promise<T>): Promise<T> {
    const unique = [...new Set(ids)]
    for (const id of unique) this.pins.set(id, (this.pins.get(id) ?? 0) + 1)
    try { return await work() } finally {
      for (const id of unique) {
        const count = (this.pins.get(id) ?? 1) - 1
        if (count === 0) this.pins.delete(id)
        else this.pins.set(id, count)
      }
    }
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
    return this.withRooms([roomId], () => this.loadPinned(roomId))
  }

  private async loadPinned(roomId: string): Promise<Room | undefined> {
    const lifecycle = await this.contexts?.lifecycle(roomId)
    if (lifecycle && lifecycle !== 'active') return undefined
    const existing = this.registry.get(roomId)
    if (existing) { await this.assert(existing); await this.claim(roomId); return existing }
    const pending = this.loading.get(roomId)
    if (pending) return pending
    const work = this.loadOwned(roomId)
    this.loading.set(roomId, work)
    try { return await work } finally { this.loading.delete(roomId) }
  }

  private async loadOwned(roomId: string): Promise<Room | undefined> {
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
      await this.retainOffline(room, Date.now())
      this.registry.set(room)
      this.registry.touchActivity(room.id, Date.now())
      console.log(`[ws-server] restored owned room ${room.id}`)
      return room
    } catch (error) {
      room.customSessionExecutor?.dispose()
      room.session.dispose()
      throw error
    }
  }

  async retainOffline(room: Room, disconnectedAt: number): Promise<void> {
    if (room.status !== 'waiting' && room.status !== 'playing') return
    const status = room.status
    await this.directory.db.transaction(async () => {
      const connected = await this.writePresence(room)
      if (connected === 0) await this.contexts?.ensureActiveExpiry(room.id, status, disconnectedAt)
    })()
  }

  async updatePresence(room: Room): Promise<void> {
    if (room.status !== 'waiting' && room.status !== 'playing') return
    await this.directory.db.transaction(async () => { await this.writePresence(room) })()
  }

  private async writePresence(room: Room): Promise<number> {
    await this.directory.assertOwner(room.id, room.owner!)
    const connected = roomConnectedPlayerCount(room)
    await this.directory.presence(room.id, room.owner!, connected, roomOccupiedSeatCount(room))
    return connected
  }

  private canRelease(room: Room): boolean {
    return this.registry.get(room.id) === room && !this.pins.has(room.id) && !this.loading.has(room.id)
      && roomConnectedPlayerCount(room) === 0 && !this.committer.isBlocked(room.id)
  }

  private forget(room: Room): void {
    if (!this.canRelease(room) || !this.committer.forgetRoom(room.id)) return
    this.persistence.forgetRoom(room.id)
    this.registry.delete(room.id)
    this.registry.clearActivity(room.id)
    room.session.dispose()
  }

  async cleanupIdle(room: Room, now: number): Promise<void> {
    await enqueueRoomTask(room, async () => {
      if (isDevRoom(room.id) || !this.canRelease(room)) return
      const retention = await this.contexts?.readActiveRetention(room.id)
      if (retention?.kind === 'inactive') {
        if (!this.canRelease(room)) return
        await this.committer.retireRoom(room.id)
        this.forget(room)
        return
      }
      if (!retention || !room.owner) return
      const outcome = await this.directory.db.transaction(async () => {
        await this.directory.assertOwner(room.id, room.owner!)
        const owner = await this.directory.db.prepare('SELECT admission_until FROM room_ownership WHERE room_id=?')
          .get<{ admission_until: number }>(room.id)
        if ((owner?.admission_until ?? 0) > now) return 'busy'
        const pending = await this.directory.db.prepare(`SELECT 1 FROM command_requests
          WHERE (target_room_id=? OR result_room_id=?) AND outcome_json IS NULL LIMIT 1`).get(room.id, room.id)
        if (pending || !this.canRelease(room)) return 'busy'
        const current = await this.contexts!.readActiveRetention(room.id)
        if (!this.canRelease(room)) return 'busy'
        if (current.kind !== 'active') return 'inactive'
        if (current.expiresAt === null) {
          await this.retainOffline(room, now)
          return 'retained'
        }
        if (current.expiresAt <= now) return 'due'
        return 'retained'
      })()
      if (outcome === 'busy') return
      if (outcome === 'due') {
        if (!this.canRelease(room) || !await this.contexts!.expireIfDue(room.id, now)) return
        this.checkpoint.markInactive(room.id)
        await this.committer.retireRoom(room.id)
        this.forget(room)
        return
      }
      if (outcome === 'inactive') {
        await this.committer.retireRoom(room.id)
        this.forget(room)
        return
      }
      const lastActivity = this.registry.lastActivityOf(room.id) ?? now
      if (now - lastActivity < OFFLINE_CACHE_TTL_MS) return
      this.forget(room)
    })
  }

  async cleanupRetainedRooms(): Promise<void> {
    await this.contexts?.expireInactiveRooms(this.instanceId, [...this.registry.iter()].map(room => room.id))
  }
}
