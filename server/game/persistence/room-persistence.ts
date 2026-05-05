import type { SerializedGameState } from '../../../shared/game/serialization.ts'

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export type RoomMeta = {
  createdBy: string | null
  maxPlayers: number
  customCardDbIds: string[]
  status: RoomStatus
  /** Seated players with persisted user identity. Anonymous seats are skipped. */
  players: Array<{ userId: string; playerIndex: number }>
}

export type RoomSnapshot = {
  id: string
  /** null = row exists but no state has been saved yet (e.g., room just created). */
  serialized: SerializedGameState | null
  meta: RoomMeta
  /** ms-since-epoch of the last save. */
  updatedAt: number
}

export type RestoreOptions = {
  now: number
  waitingTtlMs: number
  playingTtlMs: number
  /** Exclude these ids (typically fixed dev rooms loaded by another path). */
  excludeIds?: ReadonlyArray<string>
}

/**
 * Narrow persistence interface for room state + meta. Three adapters:
 *   - SqliteRoomPersistence  (production / dev with PERSIST_ROOMS=sqlite)
 *   - JsonRoomPersistence    (legacy / dev with PERSIST_ROOMS=json)
 *   - InMemoryRoomPersistence (tests, plus future use cases)
 *
 * Behavioural differences are documented per-adapter; the contract test
 * (`adapter-contract.test.ts`) only asserts the common subset.
 */
export interface RoomPersistence {
  /** Returns null if the row doesn't exist. */
  load(id: string): RoomSnapshot | null
  /** Upsert serialized state + meta. May ignore meta-only fields per adapter. */
  save(id: string, serialized: SerializedGameState, meta: RoomMeta): void
  /** Hard-delete the row. Idempotent — silently no-ops if row absent. */
  delete(id: string): void
  /** Flip status to 'finished'. Adapter may no-op if status not stored. */
  markFinished(id: string, now: number): void
  /**
   * Side-effect: also marks rows older than TTL as 'finished' before listing.
   * Returns non-finished rooms whose updatedAt is within TTL.
   */
  listRestorable(opts: RestoreOptions): RoomSnapshot[]
}
