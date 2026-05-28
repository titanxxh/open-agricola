import type { ActionExecutionResult, GameState, PlayerState } from '../../contract/types'
import { computeHarvestFeedingRequirement } from './harvest-feeding-requirement'

export const feedFamily = (state: GameState, player: PlayerState): ActionExecutionResult => {
  let requiredFood = computeHarvestFeedingRequirement(state, player)
  const useFood = Math.min(player.resources.food, requiredFood)
  player.resources.food -= useFood
  requiredFood -= useFood
  while (requiredFood > 0 && player.resources.grain > 0) {
    player.resources.grain -= 1
    requiredFood -= 1
  }
  while (requiredFood > 0 && player.resources.vegetable > 0) {
    player.resources.vegetable -= 1
    requiredFood -= 1
  }
  if (requiredFood > 0) {
    player.resources.begging += requiredFood
  }
  return { type: 'ok' }
}
