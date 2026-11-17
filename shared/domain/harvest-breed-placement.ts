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
    else {
      // Payments can exhaust parents, but later gains must remain separate from
      // the entire unsettled litter, not just one newborn.
      const newborns = state?.harvestBreedSummary?.[player.id]?.resources[animal] ?? 1
      placement.minimums[animal] = Math.max(newborns, minimum + count - (placement.animalCounts[animal] ?? 0))
    }
    placement.animalCounts[animal] = count
  }
  return placement
}
