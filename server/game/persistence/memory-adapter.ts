import type {
  GameResult,
  RoomCompletionResult,
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RestoreOptions,
} from './room-persistence.ts'
import type { SerializedGameState } from '../../../shared/session/serialization.ts'

type Row = { serialized: SerializedGameState | null; meta: RoomMeta; updatedAt: number }

export class InMemoryRoomPersistence implements RoomPersistence {
  private rooms = new Map<string, Row>()
  private results = new Map<string, GameResult>()

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
      meta: {
        ...meta,
        startedAt: existing?.meta.startedAt ?? meta.startedAt,
        customCardDbIds: [...meta.customCardDbIds],
        players: meta.players.map((p) => ({ ...p })),
      },
      updatedAt: Date.now(),
    })
  }

  discard(id: string): void {
    this.rooms.delete(id)
  }

  complete(result: GameResult): RoomCompletionResult {
    if (!this.results.has(result.roomId)) {
      const persistedPlayers = this.rooms.get(result.roomId)?.meta.players ?? []
      const userIds = new Map(persistedPlayers.map((player) => [player.playerIndex, player.userId]))
      this.results.set(result.roomId, {
        ...result,
        players: result.players.map((player) => ({
          ...player,
          userId: userIds.get(player.playerIndex) ?? player.userId,
        })),
      })
    }
    this.rooms.delete(result.roomId)
    return { ok: true, archived: true }
  }

  hasRoomId(id: string): boolean {
    return this.rooms.has(id) || this.results.has(id)
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
      out.push({ id, serialized: row.serialized, meta: { ...row.meta, customCardDbIds: [...row.meta.customCardDbIds], players: row.meta.players.map((p) => ({ ...p })) }, updatedAt: row.updatedAt })
    }
    return out
  }

  /** Test helper — adjust an entry's updatedAt to simulate TTL elapse. */
  __setUpdatedAtForTest(id: string, updatedAt: number): void {
    const row = this.rooms.get(id)
    if (row) row.updatedAt = updatedAt
  }

  __getResultForTest(id: string): GameResult | undefined {
    return this.results.get(id)
  }
}
