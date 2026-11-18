import type { BreedPlacement, GameState, NonHarvestBreedPlacement, PlayerState } from '../contract/types'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../contract/animals'

type AnimalCounts = Partial<Record<AnimalKey, number>>

const syncBreedPlacement = (placement: BreedPlacement, player: PlayerState, newborns: AnimalCounts | undefined): void => {
  for (const animal of ALL_ANIMAL_KEYS) {
    const minimum = placement.minimums[animal]
    if (minimum === undefined) continue
    const count = player.resources[animal] ?? 0
    if (count === 0) delete placement.minimums[animal]
    else {
      // Payments can exhaust parents, but later gains must remain separate from
      // the entire unsettled litter, not just one newborn.
      placement.minimums[animal] = Math.max(newborns?.[animal] ?? 1, minimum + count - (placement.animalCounts[animal] ?? 0))
    }
    placement.animalCounts[animal] = count
  }
}

export const syncHarvestBreedPlacement = (state: GameState | undefined, player: PlayerState): BreedPlacement | undefined => {
  const placement = state?.harvestBreedPlacement?.[player.id]
  if (placement) syncBreedPlacement(placement, player, state?.harvestBreedSummary?.[player.id]?.resources)
  return placement
}

export const syncNonHarvestBreedPlacement = (
  state: GameState | undefined,
  player: PlayerState,
): NonHarvestBreedPlacement | undefined => {
  const placement = state?.nonHarvestBreedPlacement?.[player.id]
  if (placement) syncBreedPlacement(placement, player, placement.newborns)
  return placement
}

/** Keeps every unsettled breed placement in step with the player's animal counts. */
export const syncBreedPlacements = (state: GameState | undefined, player: PlayerState) => {
  syncHarvestBreedPlacement(state, player)
  syncNonHarvestBreedPlacement(state, player)
}

/** Newborns still unsettled after any breeding; while present, animals cannot be turned into food. */
export const hasUnsettledNonHarvestNewborns = (state: GameState | undefined, player: PlayerState | undefined) =>
  !!player && !!state?.nonHarvestBreedPlacement?.[player.id]

/**
 * Counts the newborns housed after a reorganization. The placement minimum
 * includes every unsettled newborn: keep the required non-newborn animals,
 * then count offspring individually, lowering the minimum with them.
 */
export const settleHousedNewborns = (
  placement: BreedPlacement,
  newborns: AnimalCounts,
  after: AnimalCounts,
  animals: readonly AnimalKey[],
): AnimalCounts => {
  const housed: AnimalCounts = {}
  for (const animal of animals) {
    const litter = newborns[animal] ?? 0
    const minimum = placement.minimums[animal] ?? Infinity
    const nonNewbornMinimum = Math.max(0, minimum - litter)
    const retained = Math.min(litter, Math.max(0, (after[animal] ?? 0) - nonNewbornMinimum))
    if (retained === 0) {
      delete placement.minimums[animal]
    } else {
      housed[animal] = retained
      placement.minimums[animal] = nonNewbornMinimum + retained
    }
  }
  placement.animalCounts = { ...after }
  return housed
}
