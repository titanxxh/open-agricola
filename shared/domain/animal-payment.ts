import type { GameState, PlayerState } from '../contract/types'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../contract/animals'
import { computeAnimalZones, type AnimalZone } from './animal-zones'
import { getAssignedAnimalsByType, subtractAnimalsFromBoard } from './animals'
import {
  readPrivateAnimalCounts,
  writePrivateAnimalCounts,
} from './animal-holder-state'

export type AnimalPaymentCounterSource = {
  kind: 'cardCounter'
  cardId?: string
  counterKey: string
}

export type AnimalPaymentPreference = {
  animal: AnimalKey
  prefer?: AnimalPaymentCounterSource[]
  avoid?: AnimalPaymentCounterSource[]
}

export const isAnimalResourceKey = (key: string): key is AnimalKey =>
  (ALL_ANIMAL_KEYS as readonly string[]).includes(key)

export const readAnimalPaymentPreference = (
  actionContext: Record<string, unknown> | undefined,
): AnimalPaymentPreference | undefined => {
  const raw = actionContext?.animalPaymentPreference
  if (!raw || typeof raw !== 'object') return undefined
  const pref = raw as Partial<AnimalPaymentPreference>
  if (!ALL_ANIMAL_KEYS.includes(pref.animal as AnimalKey)) return undefined
  return pref as AnimalPaymentPreference
}

const takeFromCardCounter = (
  player: PlayerState,
  source: AnimalPaymentCounterSource,
  amount: number,
): number => {
  if (!source.cardId) {
    let remaining = amount
    for (const cardId of Object.keys(player.cardStates ?? {})) {
      if (remaining <= 0) break
      remaining -= takeFromCardCounter(player, { ...source, cardId }, remaining)
    }
    return amount - remaining
  }
  const counters = player.cardStates?.[source.cardId]?.counters
  const current = counters?.[source.counterKey] ?? 0
  if (!counters || current <= 0 || amount <= 0) return 0
  const take = Math.min(current, amount)
  counters[source.counterKey] = current - take
  return take
}

const takeFromPrivateAnimals = (
  player: PlayerState,
  animal: AnimalKey,
  amount: number,
): number => {
  let remaining = amount
  for (const state of Object.values(player.cardStates ?? {})) {
    if (remaining <= 0) break
    const extra = state?.extraData as Record<string, unknown> | undefined
    if (!extra) continue
    const counts = readPrivateAnimalCounts(extra)
    const take = Math.min(counts[animal] ?? 0, remaining)
    if (take <= 0) continue
    counts[animal] -= take
    writePrivateAnimalCounts(extra, counts)
    remaining -= take
  }
  return amount - remaining
}

const takeFromVisibleAnimals = (
  player: PlayerState,
  animal: AnimalKey,
  amount: number,
): number => {
  const take = Math.min(getAssignedAnimalsByType(player)[animal] ?? 0, amount)
  if (take > 0) subtractAnimalsFromBoard(player, { [animal]: take })
  return take
}

const zoneAnimalCount = (zone: AnimalZone, animal: AnimalKey): number =>
  zone.animalCounts?.[animal] ?? (zone.animalType === animal ? zone.animalCount ?? 0 : 0)

const sourceMatchesZone = (source: AnimalPaymentCounterSource, zone: AnimalZone): boolean =>
  source.counterKey === zone.capacityCounterKey && (!source.cardId || source.cardId === zone.cardId)

const takeFromCounterBackedAnimalZones = (
  state: GameState | undefined,
  player: PlayerState,
  animal: AnimalKey,
  amount: number,
  avoid: readonly AnimalPaymentCounterSource[] = [],
): number => {
  if (!state) return 0
  let remaining = amount
  for (const zone of computeAnimalZones(player, state)) {
    if (remaining <= 0) break
    if (zone.zoneType !== 'card' || !zone.cardId) continue
    if (!zone.capacityCounterKey || zone.capacityLossOnPayment !== true) continue
    if (zone.allowedAnimalType && zone.allowedAnimalType !== animal) continue
    if (avoid.some((source) => sourceMatchesZone(source, zone))) continue
    const counters = player.cardStates?.[zone.cardId]?.counters
    if (!counters) continue
    const current = counters[zone.capacityCounterKey] ?? 0
    const available = Math.min(current, zoneAnimalCount(zone, animal))
    const take = Math.min(available, remaining)
    if (take <= 0) continue
    counters[zone.capacityCounterKey] = current - take
    remaining -= take
  }
  return amount - remaining
}

export const applyAnimalPayment = (
  player: PlayerState,
  state: GameState | undefined,
  animal: AnimalKey,
  amount: number,
  preference?: AnimalPaymentPreference,
): void => {
  const total = Math.max(0, Math.floor(amount))
  const originalResource = player.resources[animal] ?? 0
  let remaining = total
  for (const source of preference?.prefer ?? []) {
    if (remaining <= 0) break
    remaining -= takeFromCardCounter(player, source, remaining)
  }
  if (remaining > 0) remaining -= takeFromPrivateAnimals(player, animal, remaining)
  if (remaining > 0) remaining -= takeFromVisibleAnimals(player, animal, remaining)
  const hasSpecificPreferredSource = (preference?.prefer ?? []).some((source) => source.cardId)
  if (remaining > 0 && !hasSpecificPreferredSource) {
    remaining -= takeFromCounterBackedAnimalZones(state, player, animal, remaining, preference?.avoid ?? [])
  }
  for (const source of preference?.avoid ?? []) {
    if (remaining <= 0) break
    remaining -= takeFromCardCounter(player, source, remaining)
  }
  player.resources[animal] = Math.max(0, originalResource - total)
}
