import type { ExecutionStamp } from '../execution-access'
import type { OwnerToken } from '../room-directory'
import type { RoomInputWindow } from '../command-input'
import type { CommandReceiptWrite } from '../command-store'
import type { PersistedSessionSnapshot } from '../../../shared/session/serialization.ts'
import type { CustomCardData } from '../../../shared/cards/session-card-context.ts'

export type RoomWriteOptions = { executionStamp?: ExecutionStamp; owner?: OwnerToken; expectedVersion?: number | null; retiredOwner?: OwnerToken; retiredVersion?: number; resume?: boolean; retireRoomId?: string; receipt?: CommandReceiptWrite }

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export type RoomMeta = {
  executionStamp?: ExecutionStamp
  owner?: OwnerToken
  inputWindow?: RoomInputWindow | null
  createdBy: string | null
  startedAt?: number | null
  maxPlayers: number
  customCardDbIds: string[]
  customCards?: CustomCardData[]
  replayRecording?: boolean
  replayViewerBuildId?: string
  replayGameBuildId?: string
  enableParentCards?: boolean
  draftParents?: boolean
  enableThroughTheSeasons?: boolean
  enableFarmersOfTheMoor?: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal?: boolean
  enableSnakeOpening?: boolean
  /** One device plays every seat: hidden from the room list, creator-only resume. */
  hotseat?: boolean
  status: RoomStatus
  /** Seated players with persisted user identity. Anonymous seats are skipped. */
  players: Array<{ userId: string; playerIndex: number }>
}

export type RoomSnapshot = {
  version?: number
  id: string
  /** null = row exists but no state has been saved yet (e.g., room just created). */
  serialized: PersistedSessionSnapshot | null
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
  nameIsDefault?: boolean
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
  snakeOpening: boolean
  players: GameResultPlayer[]
}

/** PostgreSQL is the runtime store. The memory implementation is a test double. */
export interface RoomPersistence {
  load(id: string): Promise<RoomSnapshot | null> | RoomSnapshot | null
  /** A null snapshot updates metadata while preserving the committed state. */
  save(id: string, serialized: PersistedSessionSnapshot | null, meta: RoomMeta, options?: RoomWriteOptions): Promise<void> | void
  discard(id: string, options?: RoomWriteOptions): Promise<void> | void
  hasRoomId(id: string): Promise<boolean> | boolean
  /** Expires eligible contexts before returning active recoverable rooms. */
  listRestorable(opts: RestoreOptions): Promise<RoomSnapshot[]> | RoomSnapshot[]
}
