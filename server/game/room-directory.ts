import type { RoomSummary } from '../../shared/contract/protocol/ws'
import { randomUUID } from 'node:crypto'
import type { PostgresDatabase } from '../database/postgres'
import type { CommandIdentity } from '../../shared/contract/protocol/commands'
import { selectDevelopmentRoom } from './development-room-slots'

export const INSTANCE_LEASE_MS = 30000
const ALLOCATION_LEASE_MS = 5 * 60000
export type OwnerToken = { instanceId: string; epoch: number }
export type RoomRoute = { roomId: string; owner: OwnerToken; wsPath: string }
export class RoomOwnershipError extends Error { readonly code = 'room_owner_changed' }
export class RoomCapacityError extends Error { readonly code = 'room_capacity_reached' }
type Instance = { instance_id: string; internal_url: string; generation: string; status: string; room_capacity: number; lease_until: number }
type Ownership = { room_id: string; instance_id: string; epoch: number; lease_until: number; status: string; development: boolean }
const route = (owner: Ownership): RoomRoute => ({ roomId: owner.room_id, owner: { instanceId: owner.instance_id, epoch: owner.epoch }, wsPath: `/nodes/${encodeURIComponent(owner.instance_id)}/ws` })

/** Shared placement and fencing. Room state and undo never contain this epoch. */
export class RoomDirectory {
  readonly db: PostgresDatabase
  constructor(db: PostgresDatabase) { this.db = db }
  private async now(): Promise<number> { return (await this.db.prepare('SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now').get<{ now: number }>())!.now }
  private async serial(): Promise<void> { await this.db.exec('SELECT pg_advisory_xact_lock(973)') }

  async register(instanceId: string, internalUrl: string, generation: string, capacity = 30): Promise<void> {
    const url = new URL(internalUrl)
    if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid private instance URL')
    if (!/^[A-Za-z0-9-]+$/.test(instanceId) || !generation || !Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Invalid instance registration')
    await this.db.transaction(async () => {
      await this.serial()
      const now = await this.now()
      if (await this.db.prepare("SELECT 1 FROM app_instances WHERE lease_until > ? AND status IN ('starting','ready') AND generation != ? LIMIT 1").get(now, generation)) throw new Error('Stop the previous deployment generation before starting this build')
      if (await this.db.prepare("SELECT 1 FROM app_instances WHERE (instance_id = ? OR internal_url = ?) AND lease_until > ? AND status != 'stopped'").get(instanceId, url.origin, now)) throw new Error('Application instance is already registered')
      // Each process uses a new identity, including after a normal restart.
      await this.db.prepare(`INSERT INTO app_instances(instance_id, internal_url, generation, status, room_capacity, lease_until, updated_at)
        VALUES (?, ?, ?, 'starting', ?, ?, ?)`).run(instanceId, url.origin, generation, capacity, now + INSTANCE_LEASE_MS, now)
    })()
  }

  async activate(instanceId: string): Promise<void> {
    const now = await this.now()
    const result = await this.db.prepare("UPDATE app_instances SET status='ready', updated_at=? WHERE instance_id=? AND status='starting' AND lease_until>?").run(now, instanceId, now)
    if (!result.changes) throw new RoomOwnershipError('Instance lease expired during startup')
  }

  async heartbeat(instanceId: string): Promise<string[]> {
    return this.db.transaction(async () => {
      const instance = await this.db.prepare('SELECT * FROM app_instances WHERE instance_id=? FOR UPDATE').get<Instance>(instanceId)
      const now = await this.now()
      if (!instance || instance.lease_until <= now || !['starting', 'ready'].includes(instance.status)) throw new RoomOwnershipError('Application instance no longer owns its lease')
      const lost = await this.db.prepare("SELECT room_id FROM room_ownership WHERE instance_id=? AND status!='retired' AND lease_until<=?").all<{ room_id: string }>(instanceId, now)
      await this.db.prepare('UPDATE app_instances SET lease_until=?, updated_at=? WHERE instance_id=?').run(now + INSTANCE_LEASE_MS, now, instanceId)
      await this.db.prepare(`UPDATE room_ownership owner SET lease_until=? WHERE instance_id=? AND status!='retired' AND lease_until>?
        AND (status='active' OR development OR EXISTS(SELECT 1 FROM room_allocations a WHERE a.room_id=owner.room_id AND a.expires_at>?))`).run(now + INSTANCE_LEASE_MS, instanceId, now, now)
      return lost.map(owner => owner.room_id)
    })()
  }

  async stop(instanceId: string): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.prepare("UPDATE app_instances SET status='stopped', lease_until=0 WHERE instance_id=?").run(instanceId)
      await this.db.prepare('UPDATE room_ownership SET lease_until=0 WHERE instance_id=?').run(instanceId)
    })()
  }

  async instances(): Promise<Instance[]> {
    return this.db.prepare("SELECT * FROM app_instances WHERE status='ready' AND lease_until>? ORDER BY instance_id").all<Instance>(await this.now())
  }

  private async selectInstance(preferred?: string, development = false, replacing?: string): Promise<Instance> {
    const now = await this.now()
    const rows = await this.db.prepare(`SELECT i.*, count(o.room_id)::bigint AS rooms FROM app_instances i
      LEFT JOIN room_ownership o ON o.instance_id=i.instance_id AND o.status!='retired' AND NOT o.development AND o.lease_until>? AND o.room_id != ? AND (o.status='reserved' OR EXISTS(SELECT 1 FROM rooms r WHERE r.id=o.room_id))
      WHERE i.lease_until>? AND (i.status='ready' OR (i.instance_id=? AND i.status='starting'))
        AND (?::text IS NULL OR i.instance_id=?)
      GROUP BY i.instance_id HAVING ?::boolean OR count(o.room_id)<i.room_capacity
      ORDER BY count(o.room_id), i.instance_id LIMIT 1`).all<Instance>(now, replacing ?? '', now, preferred ?? null, preferred ?? null, preferred ?? null, development)
    if (!rows[0]) throw new RoomCapacityError('No application instance has room capacity')
    return rows[0]
  }

  private async claimLocked(roomId: string, preferred?: string, development = false, replacing?: string): Promise<RoomRoute> {
    const previous = await this.db.prepare('SELECT * FROM room_ownership WHERE room_id=? FOR UPDATE').get<Ownership>(roomId)
    const now = await this.now()
    if (previous?.status === 'retired') throw new RoomOwnershipError('Room ownership was retired')
    if (previous && previous.lease_until > now) {
      const instance = await this.db.prepare("SELECT 1 FROM app_instances WHERE instance_id=? AND lease_until>? AND status IN ('starting','ready')").get(previous.instance_id, now)
      if (instance) {
        if (preferred && previous.instance_id !== preferred) throw new RoomOwnershipError('Room belongs to another instance')
        return route(previous)
      }
    }
    const instance = await this.selectInstance(preferred, development, replacing)
    const owner = await this.db.prepare(`INSERT INTO room_ownership(room_id, instance_id, epoch, lease_until, status, development)
      VALUES (?, ?, 1, ?, 'reserved', ?) ON CONFLICT(room_id) DO UPDATE SET instance_id=excluded.instance_id,
        epoch=room_ownership.epoch+1, lease_until=excluded.lease_until RETURNING *`).get<Ownership>(roomId, instance.instance_id, now + INSTANCE_LEASE_MS, development)
    return route(owner!)
  }

  /** Boot recovery or discovery chooses one live owner; the process then loads it. */
  async claim(roomId: string, preferred?: string, development = false): Promise<RoomRoute> {
    return this.db.transaction(async () => { await this.serial(); return this.claimLocked(roomId, preferred, development) })()
  }

  async claimDevelopment(rootId: string, instanceId: string): Promise<RoomRoute> {
    return this.db.transaction(async () => {
      await this.serial()
      return this.claimLocked(await selectDevelopmentRoom(this.db, rootId), instanceId, true)
    })()
  }

  /** One-for-one rematches retain this node's capacity slot until atomic retirement. */
  async replacement(roomId: string, previousId: string, previousOwner: OwnerToken, development: boolean): Promise<RoomRoute> {
    return this.db.transaction(async () => {
      await this.serial()
      await this.assertOwner(previousId, previousOwner)
      return this.claimLocked(roomId, previousOwner.instanceId, development, previousId)
    })()
  }

  async allocate(actorId: string, allocationId: string): Promise<RoomRoute & { allocationId: string }> {
    if (!/^[a-f0-9-]{36}$/i.test(allocationId)) throw new Error('Invalid allocation identity')
    return this.db.transaction(async () => {
      await this.serial()
      const existing = await this.db.prepare('SELECT room_id FROM room_allocations WHERE actor_id=? AND allocation_id=?').get<{ room_id: string }>(actorId, allocationId)
      const resolved = await this.claimLocked(existing?.room_id ?? randomUUID())
      await this.db.prepare(`INSERT INTO room_allocations(actor_id, allocation_id, room_id, expires_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(actor_id, allocation_id) DO UPDATE SET expires_at=excluded.expires_at`).run(actorId, allocationId, resolved.roomId, await this.now() + ALLOCATION_LEASE_MS)
      return { ...resolved, allocationId }
    })()
  }

  /** Collect only abandoned admission work; a valid pending receipt can still retry. */
  async cleanup(): Promise<void> {
    await this.db.transaction(async () => {
      await this.serial()
      const now = await this.now()
      await this.db.prepare(`DELETE FROM room_allocations a WHERE expires_at<=? AND NOT EXISTS (
        SELECT 1 FROM command_requests r JOIN command_scopes s USING(scope_id)
        WHERE r.scope_id=a.scope_id AND r.command_id=a.command_id AND r.outcome_json IS NULL AND s.expires_at>?
      )`).run(now, now)
      await this.db.prepare(`DELETE FROM object_references ref WHERE owner_kind='room-preparation'
        AND NOT EXISTS(SELECT 1 FROM rooms WHERE id=ref.owner_id)
        AND NOT EXISTS(SELECT 1 FROM game_replays WHERE room_id=ref.owner_id)
        AND NOT EXISTS(SELECT 1 FROM room_ownership WHERE room_id=ref.owner_id AND status!='retired' AND lease_until>?)
        AND NOT EXISTS(SELECT 1 FROM room_allocations WHERE room_id=ref.owner_id)
        AND NOT EXISTS(SELECT 1 FROM command_requests r JOIN command_scopes s USING(scope_id)
          WHERE r.result_room_id=ref.owner_id AND r.outcome_json IS NULL AND s.expires_at>?)`).run(now, now)
    })()
  }

  /** Admission binds the reserved destination to exactly one durable command. */
  async consumeAllocation(actorId: string, allocationId: string, identity: CommandIdentity, instanceId: string): Promise<RoomRoute> {
    this.db.assertInTransaction()
    await this.serial()
    const row = await this.db.prepare('SELECT * FROM room_allocations WHERE actor_id=? AND allocation_id=? FOR UPDATE').get<{ room_id: string; scope_id: string | null; command_id: string | null }>(actorId, allocationId)
    if (!row) throw new RoomOwnershipError('Creation allocation is unavailable')
    if (row.command_id && (row.command_id !== identity.commandId || row.scope_id !== identity.scopeId)) throw new Error('Creation allocation already belongs to another command')
    const owner = await this.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').get<Ownership>(row.room_id)
    if (!owner || owner.instance_id !== instanceId) throw new RoomOwnershipError('Creation is routed to another instance')
    await this.assertOwner(row.room_id, { instanceId, epoch: owner.epoch })
    await this.db.prepare('UPDATE room_allocations SET scope_id=?, command_id=? WHERE actor_id=? AND allocation_id=?').run(identity.scopeId, identity.commandId, actorId, allocationId)
    return route(owner)
  }

  /** Must run inside the same transaction as the authoritative write/publication. */
  async assertOwner(roomId: string, owner: OwnerToken, expectedVersion?: number | null, retired = false): Promise<void> {
    this.db.assertInTransaction()
    await this.db.exec('SELECT pg_advisory_xact_lock_shared(975)')
    const instance = await this.db.prepare('SELECT * FROM app_instances WHERE instance_id=? FOR SHARE').get<Instance>(owner.instanceId)
    const current = await this.db.prepare('SELECT * FROM room_ownership WHERE room_id=? FOR UPDATE').get<Ownership>(roomId)
    const now = await this.now()
    if (!instance || !['starting', 'ready'].includes(instance.status) || instance.lease_until <= now || !current
      || current.instance_id !== owner.instanceId || current.epoch !== owner.epoch
      || (retired ? current.status !== 'retired' : current.lease_until <= now || current.status === 'retired')) throw new RoomOwnershipError('Room ownership changed; reconnect to its current owner')
    if (expectedVersion !== undefined) {
      const room = await this.db.prepare('SELECT version FROM rooms WHERE id=? FOR UPDATE').get<{ version: number }>(roomId)
      if (expectedVersion === null ? !!room : !room || room.version !== expectedVersion) throw new RoomOwnershipError('Committed room version changed')
    }
  }

  async assertInstance(instanceId: string): Promise<void> {
    this.db.assertInTransaction()
    await this.db.exec('SELECT pg_advisory_xact_lock_shared(975)')
    const instance = await this.db.prepare('SELECT status, lease_until FROM app_instances WHERE instance_id=? FOR SHARE').get<Pick<Instance, 'status' | 'lease_until'>>(instanceId)
    if (!instance || !['starting', 'ready'].includes(instance.status) || instance.lease_until <= await this.now()) throw new RoomOwnershipError('Application instance lease ended')
  }

  async publish<T>(roomId: string, owner: OwnerToken, send: () => T, retired = false): Promise<T> {
    return this.db.transaction(async () => { await this.assertOwner(roomId, owner, undefined, retired); return send() })()
  }

  async markActive(roomId: string, owner: OwnerToken): Promise<void> {
    await this.assertOwner(roomId, owner)
    await this.db.prepare("UPDATE room_ownership SET status='active' WHERE room_id=?").run(roomId)
  }

  async retire(roomId: string, owner: OwnerToken, expectedVersion?: number | null): Promise<void> {
    await this.assertOwner(roomId, owner)
    if (expectedVersion !== undefined) {
      const active = await this.db.prepare('SELECT version FROM rooms WHERE id=? FOR UPDATE').get<{ version: number }>(roomId)
      // Completion removes active recovery data. Only lifecycle retirement may
      // use the final Step's version; ordinary writes still require a live row.
      const completed = !active && expectedVersion !== null
        ? await this.db.prepare(`SELECT s.room_version AS version FROM game_contexts c
            JOIN game_replays r ON r.room_id=c.room_id
            JOIN game_replay_steps s ON s.room_id=r.room_id AND s.step_no=r.latest_step_no
            WHERE c.room_id=? AND c.lifecycle='completed' AND r.status='completed'
            FOR SHARE OF c, r, s`).get<{ version: number }>(roomId)
        : undefined
      const current = active ?? completed
      if (expectedVersion === null ? !!active : !current || current.version !== expectedVersion) {
        throw new RoomOwnershipError('Committed room version changed')
      }
    }
    await this.db.prepare("UPDATE room_ownership SET status='retired', lease_until=0 WHERE room_id=?").run(roomId)
  }

  async presence(roomId: string, owner: OwnerToken, connected: number, occupied: number): Promise<void> {
    await this.assertOwner(roomId, owner)
    await this.db.prepare(`INSERT INTO room_presence(room_id, epoch, connected_count, occupied_count) VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET epoch=excluded.epoch, connected_count=excluded.connected_count, occupied_count=excluded.occupied_count`).run(roomId, owner.epoch, connected, occupied)
  }

  async lobby(limit = 50): Promise<RoomSummary[]> {
    const now = await this.now()
    const rows = await this.db.prepare(`SELECT r.id, r.created_by, r.max_players, COALESCE(p.occupied_count, 0) AS occupied
      FROM rooms r JOIN game_contexts c ON c.room_id=r.id AND c.lifecycle='active'
      JOIN room_ownership o ON o.room_id=r.id AND o.status='active' AND o.lease_until>?
      JOIN app_instances i ON i.instance_id=o.instance_id AND i.status='ready' AND i.lease_until>?
      LEFT JOIN room_presence p ON p.room_id=r.id AND p.epoch=o.epoch
      WHERE r.hotseat=0 AND (p.connected_count>0 OR EXISTS(SELECT 1 FROM development_room_slots s WHERE s.room_id=r.id))
      ORDER BY r.created_at, r.id LIMIT ?`).all<{ id: string; created_by: string | null; max_players: number; occupied: number }>(now, now, limit)
    return rows.map(row => ({ id: row.id, playerCount: row.occupied, maxPlayers: row.max_players,
      ...(row.created_by ? { createdBy: row.created_by } : {}), status: row.occupied < row.max_players ? 'waiting' : 'playing' }))
  }

  async owned(instanceId: string): Promise<Array<{ roomId: string; owner: OwnerToken }>> {
    const rows = await this.db.prepare("SELECT * FROM room_ownership WHERE instance_id=? AND status!='retired' AND lease_until>? ORDER BY room_id").all<Ownership>(instanceId, await this.now())
    return rows.map(row => ({ roomId: row.room_id, owner: route(row).owner }))
  }
}
