import type { InitialStateOptions } from '../../shared/session/state-constants.ts'

export type DraftSetupOptions = { draftMode: 'simultaneous'; draftPoolSize: number }

/**
 * Normalized setup choices shared by the two ways a game is created: the
 * WebSocket `createRoom` command and the HTTP `/api/game/new` hotseat request.
 * Both surfaces offer the same lobby panel, so they must agree on how the raw
 * payload maps onto `InitialStateOptions`.
 */
export type GameSetupRequest = {
  playerCount: number
  enableCommunityDeck: boolean
  enableParentCards: boolean
  draftParents: boolean | undefined
  enableThroughTheSeasons: boolean
  enableFarmersOfTheMoor: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal: boolean
  draft: DraftSetupOptions | null
  /** One device plays every seat (see `Room.hotseat`). */
  hotseat: boolean
}

export const PLAYER_COUNT_MIN = 2
export const PLAYER_COUNT_MAX = 6

export const clampPlayerCount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return PLAYER_COUNT_MIN
  return Math.min(Math.max(PLAYER_COUNT_MIN, Math.floor(value)), PLAYER_COUNT_MAX)
}

/**
 * `maxPlayers` is the room wording, `playerCount` the hotseat one; accept both
 * so the lobby can post either without a second mapping table.
 */
export const parseGameSetupRequest = (
  raw: Record<string, unknown>,
  draft: DraftSetupOptions | null,
): GameSetupRequest => ({
  playerCount: clampPlayerCount(raw.maxPlayers ?? raw.playerCount),
  enableCommunityDeck: raw.enableCommunityDeck === true,
  enableParentCards: raw.enableParentCards === true,
  draftParents: raw.draftParents === false ? false : undefined,
  enableThroughTheSeasons: raw.enableThroughTheSeasons === true,
  enableFarmersOfTheMoor: raw.enableFarmersOfTheMoor === true,
  allowIncompleteFarmersOfTheMoorMinorDeal: raw.allowIncompleteFarmersOfTheMoorMinorDeal === true,
  draft,
  hotseat: raw.hotseat === true,
})

export const buildInitialStateOptions = (request: GameSetupRequest): InitialStateOptions => ({
  playerCount: request.playerCount,
  enableCommunityDeck: request.enableCommunityDeck,
  enableParentCards: request.enableParentCards,
  ...(request.draftParents === false ? { draftParents: false } : {}),
  enableThroughTheSeasons: request.enableThroughTheSeasons,
  enableFarmersOfTheMoor: request.enableFarmersOfTheMoor,
  allowIncompleteFarmersOfTheMoorMinorDeal: request.allowIncompleteFarmersOfTheMoorMinorDeal,
  ...(request.draft
    ? { draftMode: request.draft.draftMode, draftPoolSize: request.draft.draftPoolSize }
    : {}),
})

/** Community-deck cards are only honoured when the community deck is on. */
export const resolveCustomCardDbIds = (
  raw: Record<string, unknown>,
  enableCommunityDeck: boolean,
): string[] => {
  if (!enableCommunityDeck || !Array.isArray(raw.customCardIds)) return []
  return raw.customCardIds.filter((id): id is string => typeof id === 'string')
}
