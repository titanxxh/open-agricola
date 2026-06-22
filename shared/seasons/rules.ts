import type { GameState, Resource } from '../contract/types'
import { harvestRounds } from '../session/state-constants'
import type { SeasonId } from './types'

export const isThroughTheSeasonsSeason = (
  state: GameState,
  season: SeasonId,
): boolean =>
  state.enableThroughTheSeasons === true &&
  state.throughTheSeasons?.currentSeason === season

export const remainingHarvestCount = (state: GameState): number =>
  harvestRounds.filter((round) => round >= state.round).length

export const romanticEveningCost = (state: GameState): Partial<Resource> => ({
  food: remainingHarvestCount(state),
  wood: 2,
})
