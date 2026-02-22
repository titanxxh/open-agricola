import type { ActionExecutionResult, PlayerState } from '../../game/types'

export const feedFamily = (player: PlayerState): ActionExecutionResult => {
  const newbornPenalty = Math.min(player.newbornCount, player.familySize)
  let requiredFood = Math.max(0, player.familySize * 2 - newbornPenalty)
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
