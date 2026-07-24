import type { SerializedGameState } from '../../../shared/session/serialization.ts'

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export type RoomMeta = {
  createdBy: string | null
  startedAt?: number | null
  maxPlayers: number
  customCardDbIds: string[]
  enableParentCards?: boolean
  draftParents?: boolean
  enableThroughTheSeasons?: boolean
  enableFarmersOfTheMoor?: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal?: boolean
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

export type GameResultPlayer = {
  playerIndex: number
  gamePlayerId: string
  userId: string | null
  displayName: string
  score: number
}

export type GameResult = {
  roomId: string
  startedAt: number
  finishedAt: number
  roundsPlayed: number
  playerCount: number
  communityDeck: boolean
  parentCards: boolean
  throughTheSeasons: boolean
  farmersOfTheMoor: boolean
  players: GameResultPlayer[]
}

export type RoomCompletionResult =
  | { ok: true; archived: boolean }
  | { ok: false; error: string }

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
  /**
   * Returns null if the row doesn't exist.
   *
   * Adapters that don't persist full meta (e.g., JSON-file adapter only stores
   * the serialized state) MAY return fallback values for `meta` fields; callers
   * relying on round-tripped meta should use a sqlite/memory adapter or check
   * the adapter's load contract.
   */
  load(id: string): RoomSnapshot | null
  /**
   * Upsert serialized state + meta. May ignore meta-only fields per adapter.
   *
   * Pass `serialized = null` to create a placeholder row (sqlite) or skip the
   * write (json/memory) — used when a room is created before any state has been
   * emitted.
   *
   * Adapters that track `updatedAt` MUST set it to `Date.now()` at save time —
   * the interface doesn't externalise the clock since per-broadcast persistence
   * is fire-and-forget. Tests that need deterministic timestamps should use the
   * adapter-specific test helper (e.g., `InMemoryRoomPersistence.__setUpdatedAtForTest`).
   */
  save(id: string, serialized: SerializedGameState | null, meta: RoomMeta): void
  discard(id: string): void
  complete(result: GameResult): RoomCompletionResult
  hasRoomId(id: string): boolean
  /**
   * Side-effect: also discards rows older than TTL before listing.
   * Returns non-finished rooms whose updatedAt is within TTL.
   */
  listRestorable(opts: RestoreOptions): RoomSnapshot[]
}
