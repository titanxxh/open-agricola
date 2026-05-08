import type {
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RestoreOptions,
} from './room-persistence.ts'
import type { SerializedGameState } from '../../../shared/session/serialization.ts'

type Row = { serialized: SerializedGameState | null; meta: RoomMeta; updatedAt: number }

export class InMemoryRoomPersistence implements RoomPersistence {
  private rooms = new Map<string, Row>()

  load(id: string): RoomSnapshot | null {
    const row = this.rooms.get(id)
    if (!row) return null
    return {
      id,
      serialized: row.serialized,
      meta: { ...row.meta, customCardDbIds: [...row.meta.customCardDbIds], players: row.meta.players.map((p) => ({ ...p })) },
      updatedAt: row.updatedAt,
    }
  }

  save(id: string, serialized: SerializedGameState | null, meta: RoomMeta): void {
    const existing = this.rooms.get(id)
    this.rooms.set(id, {
      serialized: serialized === null ? (existing?.serialized ?? null) : serialized,
      meta: { ...meta, customCardDbIds: [...meta.customCardDbIds], players: meta.players.map((p) => ({ ...p })) },
      updatedAt: Date.now(),
    })
  }

  delete(id: string): void {
    this.rooms.delete(id)
  }

  markFinished(id: string, now: number): void {
    const row = this.rooms.get(id)
    if (!row) return
    row.meta = { ...row.meta, status: 'finished' }
    row.updatedAt = now
  }

  listRestorable(opts: RestoreOptions): RoomSnapshot[] {
    const excludeIds = new Set(opts.excludeIds ?? [])
    const out: RoomSnapshot[] = []
    for (const [id, row] of this.rooms) {
      if (excludeIds.has(id)) continue
      if (row.meta.status === 'finished') continue
      const ttl = row.meta.status === 'playing' ? opts.playingTtlMs : opts.waitingTtlMs
      if (opts.now - row.updatedAt > ttl) {
        row.meta = { ...row.meta, status: 'finished' }
        row.updatedAt = opts.now
        continue
      }
      out.push({ id, serialized: row.serialized, meta: { ...row.meta, customCardDbIds: [...row.meta.customCardDbIds], players: row.meta.players.map((p) => ({ ...p })) }, updatedAt: row.updatedAt })
    }
    return out
  }

  /** Test helper — adjust an entry's updatedAt to simulate TTL elapse. */
  __setUpdatedAtForTest(id: string, updatedAt: number): void {
    const row = this.rooms.get(id)
    if (row) row.updatedAt = updatedAt
  }
}
