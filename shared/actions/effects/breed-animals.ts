import type { ActionExecutionResult, PlayerState } from '../../game/types'
import { getTotalAnimalCapacity } from './animals'

export const breedAnimals = (player: PlayerState): ActionExecutionResult => {
  let freeCapacity = getTotalAnimalCapacity(player)
  ;(['sheep', 'boar', 'cattle'] as const).forEach((animalType) => {
    if (freeCapacity <= 0) return
    if (player.resources[animalType] >= 2) {
      player.resources[animalType] += 1
      freeCapacity -= 1
    }
  })
  return { type: 'ok' }
}
