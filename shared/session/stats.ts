import type {
  PlayerState,
  PlayerStats,
  Resource,
} from '../contract/types'

export const createInitialPlayerStats = (
  options: { isFirstPlayer: boolean },
): PlayerStats => ({
  placedFarmers: 0,
  firstPlayerCount: options.isFirstPlayer ? 1 : 0,
  totalRoomsBuilt: 0,
  totalMajorBuilt: 0,
  totalMinorBuilt: 0,
  totalOccupationBuilt: 0,
  harvestedGrain: 0,
  harvestedVegetable: 0,
  resourcesFromBoard: {},
  resourcesFromCards: {},
  resourcesConverted: {},
  foodFromConversion: {},
  draftHistory: [],
  draftDiscarded: [],
})

const ensureStats = (player: PlayerState): PlayerStats => {
  if (!player.stats) {
    player.stats = createInitialPlayerStats({ isFirstPlayer: false })
  }
  return player.stats
}

const addToDict = (
  dict: Partial<Resource>,
  resources: Partial<Resource>,
) => {
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    const k = key as keyof Resource
    dict[k] = (dict[k] ?? 0) + value
  })
}

export const incPlacedFarmers = (player: PlayerState) => {
  ensureStats(player).placedFarmers += 1
}

export const incFirstPlayer = (player: PlayerState) => {
  ensureStats(player).firstPlayerCount += 1
}

export const incRoomsBuilt = (player: PlayerState, count: number) => {
  if (count <= 0) return
  ensureStats(player).totalRoomsBuilt += count
}

export const incMajorBuilt = (player: PlayerState) => {
  ensureStats(player).totalMajorBuilt += 1
}

export const incMinorBuilt = (player: PlayerState) => {
  ensureStats(player).totalMinorBuilt += 1
}

export const incOccupationBuilt = (player: PlayerState) => {
  ensureStats(player).totalOccupationBuilt += 1
}

export const incHarvestedGrain = (player: PlayerState, count: number) => {
  if (count <= 0) return
  ensureStats(player).harvestedGrain += count
}

export const incHarvestedVegetable = (player: PlayerState, count: number) => {
  if (count <= 0) return
  ensureStats(player).harvestedVegetable += count
}

export const addResourcesFromBoard = (
  player: PlayerState,
  resources: Partial<Resource>,
) => addToDict(ensureStats(player).resourcesFromBoard, resources)

export const addResourcesFromCards = (
  player: PlayerState,
  resources: Partial<Resource>,
) => addToDict(ensureStats(player).resourcesFromCards, resources)

export const incResourceConverted = (
  player: PlayerState,
  resource: keyof Resource,
  count: number,
) => {
  if (count <= 0) return
  const dict = ensureStats(player).resourcesConverted
  dict[resource] = (dict[resource] ?? 0) + count
}

export const addFoodFromConversion = (
  player: PlayerState,
  resource: keyof Resource,
  foodAmount: number,
) => {
  if (foodAmount <= 0) return
  const dict = ensureStats(player).foodFromConversion
  dict[resource] = (dict[resource] ?? 0) + foodAmount
}

export const recordDraftPick = (
  player: PlayerState,
  cardId: string,
  draftTurn: number,
) => {
  const stats = ensureStats(player)
  if (stats.draftHistory.find((entry) => entry.cardId === cardId)) return
  stats.draftHistory.push({ cardId, draftTurn })
}

export const recordDraftPlayed = (
  player: PlayerState,
  cardId: string,
  currentTurn: number,
) => {
  const stats = ensureStats(player)
  const entry = stats.draftHistory.find((e) => e.cardId === cardId)
  if (!entry) return
  if (entry.playedTurn !== undefined) return
  entry.playedTurn = currentTurn
}

/**
 * Reserved for future pre-game discard mechanic. The current repo's draft
 * flow does not have a "discard before final pool" step, so this helper has
 * no production call site. Kept here so future work can wire it in once the
 * discard flow lands. See spec: docs/superpowers/specs/2026-04-28-stats-bga-alignment-track3-player-draft-design.md "待实施时确认 #5".
 */
export const recordDraftDiscarded = (player: PlayerState, cardId: string) => {
  const stats = ensureStats(player)
  if (!stats.draftDiscarded.includes(cardId)) {
    stats.draftDiscarded.push(cardId)
  }
}
