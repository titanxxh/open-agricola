import type { ActionExecutionResult, HarvestBreedSummary, PlayerState } from '../../game/types'
import { getTotalAnimalCapacity } from './animal-zones'

export const breedAnimals = (
  player: PlayerState,
): ActionExecutionResult & { breedSummary: HarvestBreedSummary } => {
  let freeCapacity = getTotalAnimalCapacity(player)
  const breedSummary: HarvestBreedSummary = {
    resources: {},
    animalTypes: 0,
    animalCount: 0,
  }
  ;(['sheep', 'boar', 'cattle'] as const).forEach((animalType) => {
    if (freeCapacity <= 0) return
    if (player.resources[animalType] >= 2) {
      player.resources[animalType] += 1
      breedSummary.resources[animalType] = 1
      breedSummary.animalTypes += 1
      breedSummary.animalCount += 1
      freeCapacity -= 1
    }
  })
  return { type: 'ok', breedSummary }
}
