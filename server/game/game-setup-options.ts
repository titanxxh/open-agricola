import type { InitialStateOptions } from '../../shared/session/state-constants.ts'
import type { SoloCreationConfiguration, SoloHandMode } from '../../shared/contract/game-creation'
import { isMoorBalanceRulesEnabled } from '../../shared/contract/game-variants'

export type DraftSetupOptions = { draftMode: 'simultaneous'; draftPoolSize: number }

/**
 * Normalized setup choices shared by the two ways a game is created: the
 * WebSocket `createRoom` command and the HTTP `/api/game/new` hotseat request.
 * Both surfaces offer the same lobby panel, so they must agree on how the raw
 * payload maps onto `InitialStateOptions`.
 */
export type GameSetupRequest = {
  playerCount: number
  soloHandMode?: SoloHandMode
  enableCommunityDeck: boolean
  enableParentCards: boolean
  draftParents: boolean | undefined
  enableThroughTheSeasons: boolean
  enableFarmersOfTheMoor: boolean
  enableMoorBalanceRules: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal: boolean
  enableSnakeOpening: boolean
  draft: DraftSetupOptions | null
  /** One device plays every seat (see `Room.hotseat`). */
  hotseat: boolean
}

export const PLAYER_COUNT_MIN = 1
export const PLAYER_COUNT_MAX = 6

export const clampPlayerCount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 2
  return Math.min(Math.max(PLAYER_COUNT_MIN, Math.floor(value)), PLAYER_COUNT_MAX)
}

/**
 * A request body is only a setup payload when it is a plain object: `null`,
 * arrays and primitives all parse as valid JSON but carry no setup fields, and
 * reading through them would throw instead of dealing the documented default.
 */
export const asSetupPayload = (parsed: unknown): Record<string, unknown> =>
  parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}

/**
 * `maxPlayers` is the room wording, `playerCount` the hotseat one; accept both
 * so the lobby can post either without a second mapping table.
 */
export const parseGameSetupRequest = (
  raw: Record<string, unknown>,
  draft: DraftSetupOptions | null,
): GameSetupRequest => ({
  playerCount: clampPlayerCount(raw.maxPlayers ?? raw.playerCount),
  ...(clampPlayerCount(raw.maxPlayers ?? raw.playerCount) === 1
    ? { soloHandMode: raw.soloHandMode === 'choose-7' ? 'choose-7' : 'random' } : {}),
  enableCommunityDeck: raw.enableCommunityDeck === true,
  enableParentCards: raw.enableParentCards === true,
  draftParents: raw.draftParents === false ? false : undefined,
  enableThroughTheSeasons: raw.enableThroughTheSeasons === true,
  enableFarmersOfTheMoor: raw.enableFarmersOfTheMoor === true,
  enableMoorBalanceRules: isMoorBalanceRulesEnabled(raw),
  allowIncompleteFarmersOfTheMoorMinorDeal: raw.allowIncompleteFarmersOfTheMoorMinorDeal === true,
  enableSnakeOpening: raw.enableSnakeOpening === true,
  draft,
  hotseat: raw.hotseat === true,
})

export const buildInitialStateOptions = (request: GameSetupRequest): InitialStateOptions => ({
  playerCount: request.playerCount,
  ...(request.soloHandMode ? { soloHandMode: request.soloHandMode } : {}),
  enableCommunityDeck: request.enableCommunityDeck,
  enableParentCards: request.enableParentCards,
  ...(request.draftParents === false ? { draftParents: false } : {}),
  enableThroughTheSeasons: request.enableThroughTheSeasons,
  enableFarmersOfTheMoor: request.enableFarmersOfTheMoor,
  enableMoorBalanceRules: isMoorBalanceRulesEnabled(request),
  allowIncompleteFarmersOfTheMoorMinorDeal: request.allowIncompleteFarmersOfTheMoorMinorDeal,
  enableSnakeOpening: request.enableSnakeOpening,
  ...(request.draft
    ? { draftMode: request.draft.draftMode, draftPoolSize: request.draft.draftPoolSize }
    : {}),
})

export const soloCreationConfiguration = (setup: GameSetupRequest, customCardIds: string[]): SoloCreationConfiguration => ({
  kind: 'standard-solo', maxPlayers: 1, soloHandMode: setup.soloHandMode ?? 'random',
  enableCommunityDeck: setup.enableCommunityDeck,
  customCardIds: [...new Set(customCardIds)].sort(),
  officialCardPool: 'default-implemented-A-E',
  enableParentCards: setup.enableParentCards,
  draftParents: setup.draftParents !== false,
  enableThroughTheSeasons: setup.enableThroughTheSeasons,
  enableFarmersOfTheMoor: setup.enableFarmersOfTheMoor,
  enableMoorBalanceRules: isMoorBalanceRulesEnabled(setup),
})

/** Community-deck cards are only honoured when the community deck is on. */
export const resolveCustomCardDbIds = (
  raw: Record<string, unknown>,
  enableCommunityDeck: boolean,
): string[] => {
  if (!enableCommunityDeck || !Array.isArray(raw.customCardIds)) return []
  return raw.customCardIds.filter((id): id is string => typeof id === 'string')
}
