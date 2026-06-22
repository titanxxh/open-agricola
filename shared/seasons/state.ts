import { createRng } from '../utils/rng'
import { createRoundOpenById } from '../contract/state-constants'
import type { ActionSpace, GameState, Resource } from '../contract/types'
import { seasonIds, type SeasonId, type ThroughTheSeasonsState } from './types'

const START_SEASON_SEED_NAMESPACE = 0x5e450001
type ResourceKey = keyof Resource

const isSeasonId = (value: unknown): value is SeasonId =>
  typeof value === 'string' && (seasonIds as readonly string[]).includes(value)

export const createThroughTheSeasonsState = (gameSeed: number): ThroughTheSeasonsState => {
  const rng = createRng(Math.floor(gameSeed) ^ START_SEASON_SEED_NAMESPACE)
  const startSeason = seasonIds[Math.floor(rng() * seasonIds.length)] ?? 'winter'
  return {
    startSeason,
    currentSeason: startSeason,
  }
}

export const normalizeThroughTheSeasonsState = (
  raw: unknown,
  gameSeed: number,
): ThroughTheSeasonsState => {
  if (raw && typeof raw === 'object') {
    const candidate = raw as Partial<ThroughTheSeasonsState>
    if (isSeasonId(candidate.startSeason) && isSeasonId(candidate.currentSeason)) {
      return {
        startSeason: candidate.startSeason,
        currentSeason: candidate.currentSeason,
      }
    }
  }
  return createThroughTheSeasonsState(gameSeed)
}

export const nextSeasonId = (season: SeasonId): SeasonId => {
  const index = seasonIds.indexOf(season)
  return seasonIds[(index + 1) % seasonIds.length] ?? 'winter'
}

export const advanceThroughTheSeasons = (state: GameState): void => {
  if (!state.enableThroughTheSeasons || !state.throughTheSeasons) return
  state.throughTheSeasons.currentSeason = nextSeasonId(state.throughTheSeasons.currentSeason)
}

const isOpenThisRound = (
  state: GameState,
  space: ActionSpace,
  roundOpenById: Map<string, number>,
): boolean => state.round >= (roundOpenById.get(space.id) ?? space.roundAvailable)

const adjustSpaceResource = (space: ActionSpace, resource: ResourceKey, delta: number): void => {
  space.resources[resource] = Math.max(0, (space.resources[resource] ?? 0) + delta)
}

const adjustAccumulationSpaces = (
  state: GameState,
  resource: ResourceKey,
  delta: number,
): void => {
  const roundOpenById = createRoundOpenById(state.roundActionOrder)
  state.actionSpaces.forEach((space) => {
    if (!isOpenThisRound(state, space, roundOpenById)) return
    if ((space.gainPerRound[resource] ?? 0) <= 0) return
    adjustSpaceResource(space, resource, delta)
  })
}

const adjustFishing = (state: GameState, delta: number): void => {
  const roundOpenById = createRoundOpenById(state.roundActionOrder)
  const space = state.actionSpaces.find((entry) => entry.id === 'fishing')
  if (!space || !isOpenThisRound(state, space, roundOpenById)) return
  adjustSpaceResource(space, 'food', delta)
}

export const applySeasonPreparationAdjustments = (state: GameState): void => {
  if (!state.enableThroughTheSeasons || !state.throughTheSeasons) return
  switch (state.throughTheSeasons.currentSeason) {
    case 'winter':
      adjustAccumulationSpaces(state, 'clay', -1)
      adjustAccumulationSpaces(state, 'reed', -1)
      return
    case 'spring':
      adjustAccumulationSpaces(state, 'wood', -1)
      adjustAccumulationSpaces(state, 'stone', 1)
      return
    case 'summer':
      adjustAccumulationSpaces(state, 'clay', 1)
      adjustAccumulationSpaces(state, 'stone', -1)
      adjustFishing(state, 1)
      return
    case 'autumn':
      adjustAccumulationSpaces(state, 'wood', 1)
      adjustAccumulationSpaces(state, 'reed', 1)
      return
  }
}
