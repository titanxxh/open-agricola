import type {
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RestoreOptions,
} from './room-persistence.ts'
import type { PersistedSessionSnapshot } from '../../../shared/session/serialization.ts'

type Row = { serialized: PersistedSessionSnapshot | null; meta: RoomMeta; updatedAt: number }

const copyMeta = (meta: RoomMeta): RoomMeta => ({
  ...meta,
  customCardDbIds: [...meta.customCardDbIds],
  ...(meta.customCards === undefined ? {} : { customCards: structuredClone(meta.customCards) }),
  players: meta.players.map((player) => ({ ...player })),
})

export class InMemoryRoomPersistence implements RoomPersistence {
  private rooms = new Map<string, Row>()

  load(id: string): RoomSnapshot | null {
    const row = this.rooms.get(id)
    if (!row) return null
    return {
      id,
      serialized: row.serialized,
      meta: copyMeta(row.meta),
      updatedAt: row.updatedAt,
    }
  }

  save(id: string, serialized: PersistedSessionSnapshot | null, meta: RoomMeta): void {
    const existing = this.rooms.get(id)
    this.rooms.set(id, {
      serialized: serialized === null ? (existing?.serialized ?? null) : serialized,
      meta: {
        ...copyMeta(meta),
        startedAt: existing?.meta.startedAt ?? meta.startedAt,
      },
      updatedAt: Date.now(),
    })
  }

  discard(id: string): void {
    this.rooms.delete(id)
  }

  hasRoomId(id: string): boolean {
    return this.rooms.has(id)
  }

  listRestorable(opts: RestoreOptions): RoomSnapshot[] {
    const excludeIds = new Set(opts.excludeIds ?? [])
    const out: RoomSnapshot[] = []
    for (const [id, row] of this.rooms) {
      if (excludeIds.has(id)) continue
      if (row.meta.status === 'finished') continue
      const ttl = row.meta.status === 'playing' ? opts.playingTtlMs : opts.waitingTtlMs
      if (opts.now - row.updatedAt > ttl) {
        this.rooms.delete(id)
        continue
      }
      out.push({ id, serialized: row.serialized, meta: copyMeta(row.meta), updatedAt: row.updatedAt })
    }
    return out
  }

  /** Test helper — adjust an entry's updatedAt to simulate TTL elapse. */
  __setUpdatedAtForTest(id: string, updatedAt: number): void {
    const row = this.rooms.get(id)
    if (row) row.updatedAt = updatedAt
  }
}
