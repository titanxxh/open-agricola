import type { CardResourceStats, CardState, PlayerState, Resource } from '../../game/types'

const CARD_RESOURCE_STATS_KEY = 'resourceStats'

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

export const clearCardInfobox = (
  player: PlayerState,
  cardId: string,
) => {
  if (!player.cardStates?.[cardId]) return
  delete player.cardStates[cardId]!.infobox
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

const normalizePositiveResources = (
  resources: Partial<Resource>,
): Partial<Resource> => {
  const normalized: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    normalized[key as keyof Resource] = value
  })
  return normalized
}

const mergeResources = (
  base: Partial<Resource>,
  delta: Partial<Resource>,
): Partial<Resource> => {
  const next: Partial<Resource> = { ...base }
  Object.entries(delta).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    const resourceKey = key as keyof Resource
    next[resourceKey] = (next[resourceKey] ?? 0) + value
  })
  return next
}

export const readCardResourceStats = (
  player: PlayerState,
  cardId: string,
): CardResourceStats | undefined => {
  const value = readCardExtraData<Partial<CardResourceStats>>(player, cardId, CARD_RESOURCE_STATS_KEY)
  if (!value || typeof value !== 'object') return undefined
  return {
    paid: normalizePositiveResources(value.paid ?? {}),
    gained: normalizePositiveResources(value.gained ?? {}),
  }
}

const addCardResourceStats = (
  player: PlayerState,
  cardId: string,
  field: keyof CardResourceStats,
  resources: Partial<Resource>,
) => {
  const normalized = normalizePositiveResources(resources)
  if (Object.keys(normalized).length === 0) return
  const current = readCardResourceStats(player, cardId) ?? { paid: {}, gained: {} }
  writeCardExtraData(player, cardId, CARD_RESOURCE_STATS_KEY, {
    ...current,
    [field]: mergeResources(current[field], normalized),
  } satisfies CardResourceStats)
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
  resources: Partial<Resource>,
) => {
  addCardResourceStats(player, cardId, 'gained', resources)
}
