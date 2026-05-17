import type { PlayerState } from '../contract/types'
import type { AnimalKey } from '../contract/animals'
export type { AnimalKey }

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

/**
 * Remove `counts` animals from player's board zones, decrementing player.resources.
 * Priority: pasture -> house -> stable -> animal-holder cards.
 * Caller must guarantee counts <= getAssignedAnimalsByType(player).
 *
 * Note: BGA `removeAnimals` PHP source not located; this simplified order matches
 * the B157 reserve=0 scenario semantics. If a future card requires closest-empty
 * pasture order, revisit.
 *
 * Does NOT trigger any animal-holder card hooks (e.g. C148 onAnimalRemoved if
 * such a hook exists in the future) — direct mutation only.
 */
export const subtractAnimalsFromBoard = (
  player: PlayerState,
  counts: Partial<Record<AnimalKey, number>>,
): void => {
  for (const type of ['sheep', 'boar', 'cattle'] as const) {
    let remaining = counts[type] ?? 0
    if (remaining <= 0) continue
    // 1. pasture
    for (const pasture of player.pastures ?? []) {
      if (remaining <= 0) break
      if (pasture.animalType !== type) continue
      const take = Math.min(pasture.animalCount, remaining)
      pasture.animalCount -= take
      remaining -= take
      if (pasture.animalCount <= 0) pasture.animalType = null
    }
    // 2. house animal
    if (remaining > 0 && player.houseAnimalType === type && player.houseAnimalCount > 0) {
      const take = Math.min(player.houseAnimalCount, remaining)
      player.houseAnimalCount -= take
      remaining -= take
      if (player.houseAnimalCount <= 0) player.houseAnimalType = null
    }
    // 3. stable animals (each key = 1 animal)
    if (remaining > 0 && player.stableAnimals) {
      for (const [key, animal] of Object.entries(player.stableAnimals)) {
        if (remaining <= 0) break
        if (animal !== type) continue
        player.stableAnimals[key] = null
        remaining -= 1
      }
    }
    // 4. animal-holder cards (cardStates extraData.held)
    if (remaining > 0) {
      for (const state of Object.values(player.cardStates ?? {})) {
        if (remaining <= 0) break
        const extra = state?.extraData as { held?: number; animalType?: string } | undefined
        if (!extra || extra.animalType !== type) continue
        const take = Math.min(extra.held ?? 0, remaining)
        extra.held = (extra.held ?? 0) - take
        remaining -= take
      }
    }
    // 5. player.resources total
    player.resources[type] = Math.max(0, (player.resources[type] ?? 0) - (counts[type] ?? 0))
  }
}
