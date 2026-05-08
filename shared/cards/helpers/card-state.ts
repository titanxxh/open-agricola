import type {
  CardResourceStats,
  CardStatGained,
  CardState,
  PlayerState,
  Resource,
} from '../../contract/types'

const CARD_RESOURCE_STATS_KEY = 'resourceStats'

/**
 * Generic cardState extraData key used by cards that pre-place a marker on
 * one or more action spaces (e.g. E148_Lazybones). Frontend renders these
 * markers by scanning every player's cardStates for entries with this key —
 * which means new cards with the same ability slot in without the renderer
 * naming them. Value type: `string[]` (action-space ids).
 */
export const RESERVED_ACTION_SPACES_KEY = 'reservedActionSpaces'

/** Read the action-space ids reserved by `cardId` for `player` (empty if none). */
export const getReservedActionSpaces = (
  player: PlayerState,
  cardId: string,
): string[] =>
  readCardExtraData<string[]>(player, cardId, RESERVED_ACTION_SPACES_KEY) ?? []

/** Set the action-space ids reserved by `cardId` for `player`. */
export const setReservedActionSpaces = (
  player: PlayerState,
  cardId: string,
  spaces: string[],
): void => {
  writeCardExtraData(player, cardId, RESERVED_ACTION_SPACES_KEY, spaces)
}

export const ensureCardState = (
  player: PlayerState,
  cardId: string,
): CardState => {
  if (!player.cardStates) {
    player.cardStates = {}
  }
  if (!player.cardStates[cardId]) {
    player.cardStates[cardId] = {}
  }
  return player.cardStates[cardId]!
}

export const isCardFlagged = (player: PlayerState, cardId: string) =>
  !!player.cardStates?.[cardId]?.flagged

export const setCardFlag = (
  player: PlayerState,
  cardId: string,
  flagged: boolean,
) => {
  ensureCardState(player, cardId).flagged = flagged
}

export const readCardInfobox = (
  player: PlayerState,
  cardId: string,
): string | undefined => player.cardStates?.[cardId]?.infobox

export const writeCardInfobox = (
  player: PlayerState,
  cardId: string,
  infobox: string,
) => {
  ensureCardState(player, cardId).infobox = infobox
}

export const readCardExtraData = <T>(
  player: PlayerState,
  cardId: string,
  key: string,
): T | undefined =>
  player.cardStates?.[cardId]?.extraData?.[key] as T | undefined

export const writeCardExtraData = (
  player: PlayerState,
  cardId: string,
  key: string,
  value: unknown,
) => {
  const cardState = ensureCardState(player, cardId)
  if (!cardState.extraData) {
    cardState.extraData = {}
  }
  cardState.extraData[key] = value
}

// Accepts both real-resource Partial<Resource> and pseudo-resource maps used
// by CardResourceStats.gained. Drops zero / negative / non-number values;
// preserves keys passed through (real or pseudo) without filtering — callers
// decide which keys are valid for which field.
const normalizeNonNegativeResources = <T extends Record<string, number | undefined>>(
  resources: T,
): T => {
  const normalized: Record<string, number> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    normalized[key] = value
  })
  return normalized as T
}

const mergeResources = <T extends Record<string, number | undefined>>(
  base: T | undefined,
  delta: T,
): T => {
  const next: Record<string, number | undefined> = { ...(base ?? {}) }
  Object.entries(delta).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    next[key] = ((next[key] ?? 0) as number) + value
  })
  return next as T
}

const emptyCardResourceStats = (): CardResourceStats => ({
  used: 0,
  gained: {},
  paid: {},
  saved: {},
  receivedPayment: {},
  paidToOthers: {},
})

export const readCardResourceStats = (
  player: PlayerState,
  cardId: string,
): CardResourceStats | undefined => {
  const value = readCardExtraData<Partial<CardResourceStats>>(player, cardId, CARD_RESOURCE_STATS_KEY)
  if (!value || typeof value !== 'object') return undefined
  return {
    used: typeof value.used === 'number' && value.used > 0 ? value.used : 0,
    gained: normalizeNonNegativeResources<CardStatGained>(value.gained ?? {}),
    paid: normalizeNonNegativeResources<Partial<Resource>>(value.paid ?? {}),
    saved: normalizeNonNegativeResources<Partial<Resource>>(value.saved ?? {}),
    receivedPayment: normalizeNonNegativeResources<Partial<Resource>>(value.receivedPayment ?? {}),
    paidToOthers: normalizeNonNegativeResources<Partial<Resource>>(value.paidToOthers ?? {}),
  }
}

type ResourceStatField = 'gained' | 'paid' | 'saved' | 'receivedPayment' | 'paidToOthers'

const addCardResourceStats = (
  player: PlayerState,
  cardId: string,
  field: ResourceStatField,
  resources: Partial<Resource> | CardStatGained,
) => {
  const normalized = normalizeNonNegativeResources(resources as Record<string, number | undefined>)
  if (Object.keys(normalized).length === 0) return
  const current = readCardResourceStats(player, cardId) ?? emptyCardResourceStats()
  const merged: CardResourceStats = {
    ...current,
    [field]: mergeResources(
      current[field] as Record<string, number | undefined>,
      normalized,
    ),
  } as CardResourceStats
  writeCardExtraData(player, cardId, CARD_RESOURCE_STATS_KEY, merged)
}

export const addCardResourcePaid = (
  player: PlayerState,
  cardId: string,
  resources: Partial<Resource>,
) => {
  addCardResourceStats(player, cardId, 'paid', resources)
}

export const addCardResourceGained = (
  player: PlayerState,
  cardId: string,
  resources: CardStatGained,
) => {
  addCardResourceStats(player, cardId, 'gained', resources)
}

export const incCardUsed = (player: PlayerState, cardId: string) => {
  const current = readCardResourceStats(player, cardId) ?? emptyCardResourceStats()
  writeCardExtraData(player, cardId, CARD_RESOURCE_STATS_KEY, {
    ...current,
    used: current.used + 1,
  } satisfies CardResourceStats)
}

export const addCardResourceSaved = (
  player: PlayerState,
  cardId: string,
  resources: Partial<Resource>,
) => {
  addCardResourceStats(player, cardId, 'saved', resources)
}

export const addCardResourceReceivedPayment = (
  player: PlayerState,
  cardId: string,
  resources: Partial<Resource>,
) => {
  addCardResourceStats(player, cardId, 'receivedPayment', resources)
}

export const addCardResourcePaidToOthers = (
  player: PlayerState,
  cardId: string,
  resources: Partial<Resource>,
) => {
  addCardResourceStats(player, cardId, 'paidToOthers', resources)
}

export const getCardStack = (player: PlayerState, cardId: string): string[] =>
  player.cardStates?.[cardId]?.stack ?? []

export const pushToCardStack = (player: PlayerState, cardId: string, items: string[]): void => {
  const state = ensureCardState(player, cardId)
  if (!state.stack) state.stack = []
  state.stack.push(...items)
}

export const popFromCardStack = (player: PlayerState, cardId: string): string | undefined => {
  const stack = player.cardStates?.[cardId]?.stack
  if (!stack || stack.length === 0) return undefined
  return stack.pop()
}
