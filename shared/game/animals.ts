import type { PlayerState } from './types'

export type AnimalKey = 'sheep' | 'boar' | 'cattle'

const ZERO: Record<AnimalKey, number> = { sheep: 0, boar: 0, cattle: 0 }

const isAnimalKey = (s: unknown): s is AnimalKey =>
  s === 'sheep' || s === 'boar' || s === 'cattle'

/**
 * Count animals placed on a player's board (pasture + house + stable + animal-holder cards).
 * Does NOT include reserve / unassigned animals — for total persisted count use
 * `player.resources.{sheep,boar,cattle}` directly.
 *
 * Equivalent to BGA `countAnimalsOnBoard()` semantically.
 *
 * Animal-holder cards (e.g. C148 MudWallower) report their held animals via
 * `player.cardStates[cardId].extraData = { held: number, animalType: AnimalKey }`.
 */
export const getAssignedAnimalsByType = (player: PlayerState): Record<AnimalKey, number> => {
  const result: Record<AnimalKey, number> = { ...ZERO }
  for (const pasture of player.pastures ?? []) {
    if (pasture.animalType && pasture.animalCount > 0 && isAnimalKey(pasture.animalType)) {
      result[pasture.animalType] += pasture.animalCount
    }
  }
  if (player.houseAnimalType && player.houseAnimalCount > 0 && isAnimalKey(player.houseAnimalType)) {
    result[player.houseAnimalType] += player.houseAnimalCount
  }
  for (const animal of Object.values(player.stableAnimals ?? {})) {
    if (animal && isAnimalKey(animal)) result[animal] += 1
  }
  for (const state of Object.values(player.cardStates ?? {})) {
    const extra = state?.extraData as { held?: number; animalType?: string } | undefined
    if (!extra || typeof extra.held !== 'number' || extra.held <= 0) continue
    if (isAnimalKey(extra.animalType)) {
      result[extra.animalType] += extra.held
    }
  }
  return result
}

export const getAssignedAnimalCount = (player: PlayerState): number => {
  const byType = getAssignedAnimalsByType(player)
  return byType.sheep + byType.boar + byType.cattle
}
