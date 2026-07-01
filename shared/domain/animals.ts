import type { GameState, PlayerState } from '../contract/types'
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

const addCounts = (
  target: AnimalCounts,
  counts: Partial<Record<AnimalKey, number>>,
) => {
  for (const key of ALL_ANIMAL_KEYS) {
    const amount = counts[key] ?? 0
    if (amount > 0) target[key] = (target[key] ?? 0) + amount
  }
}

const entryAnimalOwnerId = (entry: unknown): string | undefined =>
  entry && typeof entry === 'object' && typeof (entry as { animalOwnerPlayerId?: unknown }).animalOwnerPlayerId === 'string'
    ? (entry as { animalOwnerPlayerId: string }).animalOwnerPlayerId
    : undefined

const readAnimalHolderCountsWithZones = (
  extraData: unknown,
  animalOwnerPlayerId?: string,
): AnimalCounts => {
  const total = readAnimalHolderCounts(extraData)
  if (!extraData || typeof extraData !== 'object') return total
  const zoneCounts = (extraData as { animalCountsByZone?: unknown }).animalCountsByZone
  if (!zoneCounts || typeof zoneCounts !== 'object') return total
  for (const entry of Object.values(zoneCounts)) {
    const ownerId = entryAnimalOwnerId(entry)
    if (animalOwnerPlayerId && ownerId && ownerId !== animalOwnerPlayerId) continue
    addCounts(total, readAnimalHolderCounts(entry))
  }
  return total
}

const readHostedAnimalHolderCounts = (
  extraData: unknown,
  animalOwnerPlayerId: string,
): AnimalCounts => {
  const total = createAnimalCounts()
  if (!extraData || typeof extraData !== 'object') return total
  const zoneCounts = (extraData as { animalCountsByZone?: unknown }).animalCountsByZone
  if (!zoneCounts || typeof zoneCounts !== 'object') return total
  for (const entry of Object.values(zoneCounts)) {
    if (entryAnimalOwnerId(entry) !== animalOwnerPlayerId) continue
    addCounts(total, readAnimalHolderCounts(entry))
  }
  return total
}

const subtractFromCountsByZone = (
  extraData: Record<string, unknown>,
  type: AnimalKey,
  amount: number,
  animalOwnerPlayerId?: string,
) => {
  let remaining = amount
  const zoneCounts = extraData.animalCountsByZone
  if (!zoneCounts || typeof zoneCounts !== 'object') return remaining
  for (const entry of Object.values(zoneCounts)) {
    if (remaining <= 0) break
    if (!entry || typeof entry !== 'object') continue
    const ownerId = entryAnimalOwnerId(entry)
    if (animalOwnerPlayerId && ownerId && ownerId !== animalOwnerPlayerId) continue
    const zoneExtra = entry as Record<string, unknown>
    const counts = readAnimalHolderCounts(zoneExtra)
    const take = Math.min(counts[type] ?? 0, remaining)
    if (take <= 0) continue
    counts[type] -= take
    writeAnimalHolderCounts(zoneExtra, counts)
    remaining -= take
  }
  return remaining
}

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
export const getAssignedAnimalsByType = (player: PlayerState, state?: GameState): AnimalCounts => {
  const result: AnimalCounts = { ...ZERO }
  for (const pasture of player.pastures ?? []) {
    if (pasture.animalType && pasture.animalCount > 0 && isAnimalKey(pasture.animalType)) {
      result[pasture.animalType] = (result[pasture.animalType] ?? 0) + pasture.animalCount
    }
  }
  if (player.houseAnimalType && player.houseAnimalCount > 0 && isAnimalKey(player.houseAnimalType)) {
    result[player.houseAnimalType] = (result[player.houseAnimalType] ?? 0) + player.houseAnimalCount
  }
  for (const animal of Object.values(player.stableAnimals ?? {})) {
    if (animal && isAnimalKey(animal)) result[animal] = (result[animal] ?? 0) + 1
  }
  for (const cardState of Object.values(player.cardStates ?? {})) {
    addCounts(result, readAnimalHolderCountsWithZones(cardState?.extraData, state ? player.id : undefined))
  }
  if (state) {
    for (const storagePlayer of state.players ?? []) {
      if (storagePlayer.id === player.id) continue
      for (const cardState of Object.values(storagePlayer.cardStates ?? {})) {
        addCounts(result, readHostedAnimalHolderCounts(cardState?.extraData, player.id))
      }
    }
  }
  return result
}

export const getAssignedAnimalCount = (player: PlayerState, state?: GameState): number => {
  const byType = getAssignedAnimalsByType(player, state)
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
   * Does NOT trigger `CardEffect.onAnimalRemoved` — direct mutation only.
   * Callers that model system discards must notify card effects themselves.
   */
export const subtractAnimalsFromBoard = (
  player: PlayerState,
  counts: Partial<Record<AnimalKey, number>>,
  state?: GameState,
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
        if (take > 0) {
          counts[type] -= take
          writeAnimalHolderCounts(extra, counts)
          remaining -= take
        }
        if (remaining > 0) {
          remaining = subtractFromCountsByZone(extra, type, remaining, state ? player.id : undefined)
        }
      }
    }
    if (remaining > 0 && state) {
      for (const storagePlayer of state.players ?? []) {
        if (remaining <= 0) break
        if (storagePlayer.id === player.id) continue
        for (const cardState of Object.values(storagePlayer.cardStates ?? {})) {
          if (remaining <= 0) break
          const extra = cardState?.extraData as Record<string, unknown> | undefined
          if (!extra) continue
          remaining = subtractFromCountsByZone(extra, type, remaining, player.id)
        }
      }
    }
    // 5. player.resources total
    player.resources[type] = Math.max(0, (player.resources[type] ?? 0) - (counts[type] ?? 0))
  }
}
