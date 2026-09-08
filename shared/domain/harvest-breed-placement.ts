import type { GameState, PlayerState } from '../contract/types'
import { ALL_ANIMAL_KEYS } from '../contract/animals'

export const syncHarvestBreedPlacement = (state: GameState | undefined, player: PlayerState) => {
  const placement = state?.harvestBreedPlacement?.[player.id]
  if (!placement) return undefined
  for (const animal of ALL_ANIMAL_KEYS) {
    const minimum = placement.minimums[animal]
    if (minimum === undefined) continue
    const count = player.resources[animal] ?? 0
    if (count === 0) delete placement.minimums[animal]
    else placement.minimums[animal] = Math.max(1, minimum + count - (placement.animalCounts[animal] ?? 0))
    placement.animalCounts[animal] = count
  }
  return placement
}
