import { computeHarvestFeedingRequirement } from '../actions/helpers/harvest-feeding-requirement'
import { pendingHarvestSkips } from '../cards/helpers/harvest-skip'
import { harvestRounds } from '../contract/state-constants'
import type { GameState, PlayerState } from '../contract/types'
import { computeHeatingRequirement } from '../moor/heating'
import { advanceThroughTheSeasons } from '../seasons/state'

export type HarvestRequirements = {
  round: number
  food: number
  fuel: number | null
}

export const getHarvestRequirements = (state: GameState, player: PlayerState): HarvestRequirements | null => {
  const round = harvestRounds.find(candidate => candidate >= state.round)
  if (state.gameOver || round === undefined) return null
  if (pendingHarvestSkips(state, player).some(skip => skip.round === round)) {
    return { round, food: 0, fuel: state.enableFarmersOfTheMoor ? 0 : null }
  }

  const projectedPlayer = round > state.round
    ? { ...player, workers: player.workers.map(worker => ({ ...worker, isNewborn: false })) }
    : player
  const projectedState: GameState = {
    ...state,
    round,
    players: state.players.map(entry => entry.id === player.id ? projectedPlayer : entry),
    throughTheSeasons: state.throughTheSeasons ? { ...state.throughTheSeasons } : null,
  }
  for (let offset = state.round; offset < round; offset++) advanceThroughTheSeasons(projectedState)

  return {
    round,
    food: computeHarvestFeedingRequirement(projectedState, projectedPlayer),
    fuel: state.enableFarmersOfTheMoor
      ? computeHeatingRequirement(projectedState, projectedPlayer, { discountTiming: 'upcoming-harvest' }) : null,
  }
}
