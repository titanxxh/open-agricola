import type { PlayerState } from '../contract/types'
import type { AnimalKey } from '../contract/animals'
import { ALL_ANIMAL_KEYS } from '../contract/animals'
import {
  type AnimalCounts,
  createAnimalCounts,
  isAnimalKey,
  readAnimalHolderCounts,
  sumAnimalCounts,
  writeAnimalHolderCounts,
} from './animal-holder-state'
export type { AnimalKey }

const ZERO: AnimalCounts = createAnimalCounts()

/**
 * Count animals placed on a player's board (pasture + house + stable + animal-holder cards).
 * Does NOT include reserve / unassigned animals — for total persisted count use
 * `player.resources.{sheep,boar,cattle}` directly.
 *
 * Equivalent to BGA `countAnimalsOnBoard()` semantically.
 *
 * Animal-holder cards report held animals via
 *   `cardStates[cardId].extraData.animalCounts`, or legacy single-type
 *   `{ held: number, animalType: AnimalKey }`.
 *
 * Note: cards using `cardStates[cardId].counters.held` (e.g. C148_MudWallower)
 * are intentionally NOT counted here — that counter encodes permanent capacity,
 * not the current on-card population, so summing it would over-count animals
 * still tracked in `player.resources`. See spec
 * `docs/superpowers/specs/2026-05-17-B157_Salter-design.md` §7 for the known
 * B157 deviation this causes.
 */
export const getAssignedAnimalsByType = (player: PlayerState): AnimalCounts => {
  const result: AnimalCounts = { ...ZERO }
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
    const counts = readAnimalHolderCounts(state?.extraData)
    for (const key of ALL_ANIMAL_KEYS) {
      const amount = counts[key] ?? 0
      if (amount > 0) result[key] = (result[key] ?? 0) + amount
    }
  }
  return result
}

export const getAssignedAnimalCount = (player: PlayerState): number => {
  const byType = getAssignedAnimalsByType(player)
  return sumAnimalCounts(byType)
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
  for (const type of ALL_ANIMAL_KEYS) {
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
    // 4. animal-holder cards
    if (remaining > 0) {
      for (const state of Object.values(player.cardStates ?? {})) {
        if (remaining <= 0) break
        const extra = state?.extraData as Record<string, unknown> | undefined
        if (!extra) continue
        const counts = readAnimalHolderCounts(extra)
        const take = Math.min(counts[type] ?? 0, remaining)
        if (take <= 0) continue
        counts[type] -= take
        writeAnimalHolderCounts(extra, counts)
        remaining -= take
      }
    }
    // 5. player.resources total
    player.resources[type] = Math.max(0, (player.resources[type] ?? 0) - (counts[type] ?? 0))
  }
}
