import type { GameState, PlayerState, Pasture } from '../contract/types.ts'
import { ALL_ANIMAL_KEYS, animalKeysForState, type AnimalKey } from '../contract/animals.ts'
import { positionKey } from '../domain/farm.ts'
import {
  getCardEffect,
  notifyAnimalsRemovedFromCardEffects,
  type Meeple,
  type PastureCapacityModifier,
} from '../cards/card-effects.ts'
import { playerHasCardCapability } from '../cards/helpers/card-type.ts'
import {
  clampAnimalCountsToCapacity,
  compactAnimalCounts,
  createAnimalCounts,
  isAnimalKey,
  readAnimalHolderCounts,
  singleAnimalType,
  sumAnimalCounts,
  writeAnimalHolderCounts,
  type AnimalCounts,
} from './animal-holder-state.ts'

// ---------------------------------------------------------------------------
// AnimalZone type and computation helpers (formerly in
// `shared/actions/helpers/animal-zones.ts`). Inlined here so the domain
// layer is self-contained.
// ---------------------------------------------------------------------------

export type AnimalZone = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable' | 'card'
  capacity: number
  blocked?: boolean
  houseAnimalZone?: boolean
  animalType?: AnimalType | null
  animalCount?: number
  animalCounts?: Partial<Record<AnimalType, number>>
  allowedAnimalType?: AnimalType | null
  cardId?: string
  pastureIndex?: number
  farmPosition?: { row: number; col: number }
  countsFarmyardSpaceAsUnused?: boolean
  displaySource?: 'played-card' | 'farm-position'
  exclusiveCardZoneLimit?: number
  capacityCounterKey?: string
  capacityLossOnPayment?: boolean
}

type AnimalType = AnimalKey

export const buildCardAnimalZoneId = (
  cardId: string,
  position?: { row: number; col: number },
): string => position
  ? `card:${cardId}@${positionKey(position)}`
  : `card:${cardId}`

export const isHouseAnimalZone = (zone: AnimalZone): boolean =>
  zone.zoneType === 'house' || zone.houseAnimalZone === true

export const countHouseAnimals = (
  player: PlayerState,
  state: GameState = { completedFeedingPhases: 0 } as GameState,
  type?: AnimalType,
): number =>
  computeAnimalZones(player, state)
    .filter(isHouseAnimalZone)
    .reduce((sum, zone) => {
      const count = zone.animalCount ?? 0
      if (count <= 0) return sum
      if (!zone.animalType) return sum
      if (type && zone.animalType !== type) return sum
      return sum + count
    }, 0)

/** Pasture capacity formula: `size * 2 * 2^stables`. */
export const getPastureCapacity = (pasture: Pasture) =>
  pasture.size * 2 * Math.pow(2, pasture.stables)

const getPlayedCardIds = (player: PlayerState) => [
  ...(player.minorPlayed ?? []),
  ...(player.occupationPlayed ?? []),
  ...(player.improvements ?? []),
]

const collectPastureCapacityModifiers = (
  player: PlayerState,
  state: GameState,
): PastureCapacityModifier[] =>
  getPlayedCardIds(player).flatMap((cardId) =>
    getCardEffect(cardId)?.computePastureCapacityModifiers?.(player, state) ?? [],
  )

const applyPastureCapacityModifiers = (
  baseCapacity: number,
  ctx: {
    player: PlayerState
    state: GameState
    pasture: Pasture
    pastureIndex: number
  },
  modifiers: PastureCapacityModifier[],
): number => {
  let capacity = baseCapacity
  for (const modifier of modifiers.filter((mod) => mod.kind === 'replacement')) {
    if (modifier.appliesTo && !modifier.appliesTo(ctx)) continue
    capacity = modifier.apply(capacity, ctx)
  }
  for (const modifier of modifiers.filter((mod) => mod.kind === 'additive')) {
    if (modifier.appliesTo && !modifier.appliesTo(ctx)) continue
    capacity = modifier.apply(capacity, ctx)
  }
  return capacity
}

export const readAnimalCountsForZoneAssignment = (value: unknown): AnimalCounts => {
  const counts = readAnimalHolderCounts(value)
  if (sumAnimalCounts(counts) > 0) return counts
  if (!value || typeof value !== 'object') return counts
  const assignment = value as { animalType?: unknown; animalCount?: unknown }
  if (!isAnimalKey(assignment.animalType)) return counts
  if (typeof assignment.animalCount !== 'number' || !Number.isFinite(assignment.animalCount)) return counts
  counts[assignment.animalType] = Math.max(0, Math.floor(assignment.animalCount))
  return counts
}

const isAnimalKeyForState = (state: GameState, value: unknown): value is AnimalType =>
  isAnimalKey(value) && animalKeysForState(state).includes(value)

const fixedAnimalTypeForZone = (state: GameState, zone: AnimalZone): AnimalType | null => {
  if ('allowedAnimalType' in zone && zone.allowedAnimalType == null) return null
  if (isAnimalKeyForState(state, zone.allowedAnimalType)) return zone.allowedAnimalType
  if (isAnimalKeyForState(state, zone.animalType)) return zone.animalType
  return null
}

const allowsMixedAnimalTypes = (zone: AnimalZone): boolean =>
  'allowedAnimalType' in zone && zone.allowedAnimalType == null

const preferredSingleAnimalType = (
  state: GameState,
  value: unknown,
  counts: Partial<Record<AnimalType, number>>,
): AnimalType | null => {
  const assignment = value && typeof value === 'object'
    ? value as { animalType?: unknown }
    : undefined
  if (isAnimalKeyForState(state, assignment?.animalType) && (counts[assignment.animalType] ?? 0) > 0) {
    return assignment.animalType
  }
  const keys = animalKeysForState(state)
  return singleAnimalType(counts) ?? keys.find((key) => (counts[key] ?? 0) > 0) ?? null
}

const applyAnimalCountsToZone = (
  zone: AnimalZone,
  counts: Partial<Record<AnimalType, number>>,
  fixedAnimalType: AnimalType | null,
) => {
  const compact = compactAnimalCounts(counts)
  const total = sumAnimalCounts(compact)
  if (fixedAnimalType || 'allowedAnimalType' in zone) zone.allowedAnimalType = fixedAnimalType
  else delete zone.allowedAnimalType
  zone.animalCount = total
  if (total <= 0) {
    delete zone.animalCounts
    zone.animalType = fixedAnimalType
    return
  }
  zone.animalCounts = compact
  zone.animalType = singleAnimalType(compact) ?? fixedAnimalType
}

const expandCountsToMeeples = (counts: Partial<Record<AnimalType, number>>): Meeple[] =>
  ALL_ANIMAL_KEYS.flatMap((type) =>
    Array.from({ length: Math.max(0, Math.floor(counts[type] ?? 0)) }, () => ({ type } as Meeple)),
  )

export const normalizeAnimalCountsForZone = (
  state: GameState,
  player: PlayerState,
  zone: AnimalZone,
  value: unknown,
): AnimalCounts => {
  const fixedType = fixedAnimalTypeForZone(state, zone)
  const raw = readAnimalCountsForZoneAssignment(value)
  const keys = animalKeysForState(state)
  for (const key of ALL_ANIMAL_KEYS) {
    if (!keys.includes(key)) raw[key] = 0
  }
  if (fixedType) {
    for (const key of keys) {
      if (key !== fixedType) raw[key] = 0
    }
  } else if (!allowsMixedAnimalTypes(zone)) {
    const type = preferredSingleAnimalType(state, value, raw)
    for (const key of keys) {
      if (key !== type) raw[key] = 0
    }
  }
  let counts = raw
  const total = sumAnimalCounts(counts)
  if (total <= 0) return clampAnimalCountsToCapacity(counts, zone.capacity).counts
  const candidateZone: AnimalZone = {
    ...zone,
    animalType: singleAnimalType(counts) ?? fixedType,
    animalCount: total,
    animalCounts: compactAnimalCounts(counts),
    allowedAnimalType: fixedType,
  }
  const invalid = computeInvalidAnimalsForZone(state, player, candidateZone)
  for (const meeple of invalid) {
    counts[meeple.type] = Math.max(0, (counts[meeple.type] ?? 0) - 1)
  }
  counts = clampAnimalCountsToCapacity(counts, zone.capacity).counts
  return counts
}

export const getAllowedAnimalTypesForZone = (
  state: GameState,
  player: PlayerState,
  zone: AnimalZone,
): AnimalType[] => animalKeysForState(state).filter((animal) => {
  const candidate = createAnimalCounts(state.enableFarmersOfTheMoor === true)
  candidate[animal] = 1
  const normalized = normalizeAnimalCountsForZone(state, player, zone, { animalCounts: candidate })
  return (normalized[animal] ?? 0) > 0
})

const rehydrateAnimalHolderZones = (
  state: GameState,
  player: PlayerState,
  zones: AnimalZone[],
) => {
  for (const zone of zones) {
    if (zone.zoneType !== 'card' || !zone.cardId) continue
    if (typeof player.cardStates?.[zone.cardId]?.counters?.held === 'number') continue
    const fixedType = fixedAnimalTypeForZone(state, zone)
    const extraData = player.cardStates?.[zone.cardId]?.extraData
    const countsByZone = extraData?.animalCountsByZone
    const keyedCounts = countsByZone && typeof countsByZone === 'object'
      ? (countsByZone as Record<string, unknown>)[zone.id]
      : undefined
    const stored = keyedCounts !== undefined
      ? keyedCounts
      : zone.id === buildCardAnimalZoneId(zone.cardId)
        ? extraData
        : undefined
    const counts = normalizeAnimalCountsForZone(state, player, zone, stored)
    applyAnimalCountsToZone(zone, counts, fixedType)
  }
}

const ensureCardExtraData = (
  player: PlayerState,
  cardId: string,
): Record<string, unknown> | null => {
  const cardState = player.cardStates?.[cardId]
  if (!cardState) return null
  if (!cardState.extraData || typeof cardState.extraData !== 'object') cardState.extraData = {}
  return cardState.extraData as Record<string, unknown>
}

const isCounterBackedAnimalZone = (zone: AnimalZone): boolean =>
  zone.zoneType === 'card' && typeof zone.capacityCounterKey === 'string'

const writeCardZoneStorage = (
  player: PlayerState,
  cardZones: AnimalZone[],
) => {
  const byCard = new Map<string, AnimalZone[]>()
  for (const zone of cardZones) {
    if (!zone.cardId) continue
    const zones = byCard.get(zone.cardId) ?? []
    zones.push(zone)
    byCard.set(zone.cardId, zones)
  }
  for (const [cardId, zones] of byCard) {
    const extraData = ensureCardExtraData(player, cardId)
    if (!extraData) continue
    const useZoneStorage = zones.length > 1 || zones.some((zone) =>
      zone.id !== buildCardAnimalZoneId(cardId) || zone.farmPosition
    )
    if (!useZoneStorage) {
      writeAnimalHolderCounts(extraData, readAnimalCountsForZoneAssignment(zones[0]))
      continue
    }
    const next: Record<string, unknown> = {}
    for (const zone of zones) {
      const counts = readAnimalCountsForZoneAssignment(zone)
      if (sumAnimalCounts(counts) <= 0) continue
      const slot: Record<string, unknown> = {}
      writeAnimalHolderCounts(slot, counts)
      slot.capacity = zone.capacity
      if (zone.allowedAnimalType !== undefined) slot.allowedAnimalType = zone.allowedAnimalType
      if (zone.farmPosition) slot.farmPosition = zone.farmPosition
      next[zone.id] = slot
    }
    if (Object.keys(next).length > 0) extraData.animalCountsByZone = next
    else delete extraData.animalCountsByZone
    delete extraData.animalCounts
    delete extraData.animalType
    delete extraData.held
  }
}

const reserveCardZoneAnimals = (
  state: GameState,
  player: PlayerState,
  zones: AnimalZone[],
  totals: Partial<Record<AnimalType, number>>,
): AnimalCounts => {
  const reserved = createAnimalCounts(state.enableFarmersOfTheMoor === true)
  const cardZones = zones.filter((zone) => zone.zoneType === 'card' && zone.cardId)
  for (const zone of cardZones) {
    const counts = readAnimalCountsForZoneAssignment(zone)
    const kept = createAnimalCounts(state.enableFarmersOfTheMoor === true)
    for (const animalType of animalKeysForState(state)) {
      const take = Math.min(counts[animalType] ?? 0, totals[animalType] ?? 0)
      if (take <= 0) continue
      kept[animalType] = take
      reserved[animalType] = (reserved[animalType] ?? 0) + take
      totals[animalType] = (totals[animalType] ?? 0) - take
    }
    applyAnimalCountsToZone(zone, kept, fixedAnimalTypeForZone(state, zone))
  }
  writeCardZoneStorage(player, cardZones.filter((zone) => !isCounterBackedAnimalZone(zone)))
  return reserved
}

/** Loose-stable tile keys (stables not inside any pasture). */
export const getLooseStableKeys = (player: PlayerState) => {
  const pastureTiles = new Set(
    player.pastures.flatMap((pasture) =>
      (pasture.tiles ?? []).map((tile) => positionKey(tile)),
    ),
  )
  return player.stableTiles
    .map((tile) => positionKey(tile))
    .filter((key) => !pastureTiles.has(key))
}

/** Compute the full list of animal zones (pastures + house + loose stables + card zones). */
export const computeAnimalZones = (
  player: PlayerState,
  state: GameState = { completedFeedingPhases: 0 } as GameState,
): AnimalZone[] => {
  const allCards = getPlayedCardIds(player)
  const pastureCapacityModifiers = collectPastureCapacityModifiers(player, state)
  const zones: AnimalZone[] = [
    ...player.pastures.map((pasture, index) => {
      const capacity = applyPastureCapacityModifiers(
        getPastureCapacity(pasture),
        { player, state, pasture, pastureIndex: index },
        pastureCapacityModifiers,
      )
      return {
        id: pasture.id,
        zoneType: 'pasture' as const,
        capacity,
        animalType: pasture.animalType ?? null,
        animalCount: pasture.animalCount,
        pastureIndex: index,
      }
    }),
    {
      id: 'house',
      zoneType: 'house' as const,
      capacity: 1,
      houseAnimalZone: true,
      animalType: player.houseAnimalType ?? null,
      animalCount: player.houseAnimalCount ?? 0,
    },
    ...getLooseStableKeys(player).map((key) => ({
      id: `stable:${key}`,
      zoneType: 'stable' as const,
      capacity: 1,
      animalType: player.stableAnimals?.[key] ?? null,
      animalCount: player.stableAnimals?.[key] ? 1 : 0,
    })),
  ]
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (effect?.onComputeAnimalZones) {
      const firstNewZoneIndex = zones.length
      const result = effect.onComputeAnimalZones(player, zones, state)
      if (Array.isArray(result)) {
        zones.push(...result)
      }
      for (let i = firstNewZoneIndex; i < zones.length; i += 1) {
        const zone = zones[i]!
        if (zone.zoneType === 'card' && !zone.cardId) zone.cardId = cardId
      }
    }
  }
  if (playerHasCardCapability(player, 'blocksHouseAnimalZones')) {
    for (let i = zones.length - 1; i >= 0; i -= 1) {
      if (isHouseAnimalZone(zones[i]!)) zones.splice(i, 1)
    }
  }
  zones.forEach((zone) => {
    if (zone.blocked) {
      zone.capacity = 0
    }
  })
  rehydrateAnimalHolderZones(state, player, zones)
  return zones
}

/** Total assigned animal count across pastures + house + loose stables. */
export const getAssignedAnimalCount = (player: PlayerState) => {
  const pastureCount = player.pastures.reduce(
    (sum, pasture) => sum + pasture.animalCount,
    0,
  )
  const houseCount =
    player.houseAnimalType && player.houseAnimalCount > 0
      ? player.houseAnimalCount
      : 0
  const stableCount = Object.values(player.stableAnimals ?? {}).filter(Boolean).length
  return pastureCount + houseCount + stableCount
}

/** Total animal capacity across all zones. */
export const getTotalAnimalCapacity = (
  player: PlayerState,
  state: GameState = { completedFeedingPhases: 0 } as GameState,
) => computeAnimalZones(player, state).reduce((sum, zone) => sum + zone.capacity, 0)

const expandZoneToMeeples = (zone: AnimalZone): Meeple[] => {
  const counts = readAnimalCountsForZoneAssignment(zone)
  return expandCountsToMeeples(counts)
}

/**
 * Run the owning card's `getInvalidAnimals` hook for a card-typed zone.
 * Returns the meeples flagged invalid by the card. Returns an empty list if
 * the zone is not card-typed or the card has no hook registered.
 */
export const computeInvalidAnimalsForZone = (
  state: GameState,
  player: PlayerState,
  zone: AnimalZone,
): Meeple[] => {
  if (zone.zoneType !== 'card' || !zone.cardId) return []
  const effect = getCardEffect(zone.cardId)
  if (!effect?.getInvalidAnimals) return []
  const meeples = expandZoneToMeeples(zone)
  try {
    return effect.getInvalidAnimals(player, zone, meeples, state)
  } catch (err) {
    if (zone.cardId.startsWith('CUSTOM_')) {
      console.warn(
        `[animal-zones] custom card ${zone.cardId} getInvalidAnimals threw, skipping:`,
        err,
      )
      return []
    }
    throw err
  }
}

type AnimalAccommodationWorkZone = AnimalZone & {
  animalCounts: AnimalCounts
  animalCount: number
}

const createAccommodationWorkZone = (
  state: GameState,
  zone: AnimalZone,
): AnimalAccommodationWorkZone => {
  const workZone: AnimalAccommodationWorkZone = {
    ...zone,
    animalCounts: createAnimalCounts(state.enableFarmersOfTheMoor === true),
    animalCount: 0,
    animalType: null,
  }
  return workZone
}

const targetAnimalList = (
  state: GameState,
  targetCounts: Partial<Record<AnimalType, number>>,
): AnimalType[] | null => {
  const keys = animalKeysForState(state)
  for (const key of ALL_ANIMAL_KEYS) {
    if (!keys.includes(key) && (targetCounts[key] ?? 0) > 0) return null
  }
  return keys.flatMap((key) =>
    Array.from({ length: Math.max(0, Math.floor(targetCounts[key] ?? 0)) }, () => key),
  )
}

const candidateZoneWithAnimal = (
  zone: AnimalAccommodationWorkZone,
  type: AnimalType,
): AnimalAccommodationWorkZone => {
  const animalCounts = { ...zone.animalCounts }
  animalCounts[type] = (animalCounts[type] ?? 0) + 1
  const animalCount = zone.animalCount + 1
  return {
    ...zone,
    animalCounts,
    animalCount,
    animalType: singleAnimalType(animalCounts),
  }
}

const canPlaceAnimalInWorkZone = (
  state: GameState,
  player: PlayerState,
  zones: AnimalAccommodationWorkZone[],
  zoneIndex: number,
  zone: AnimalAccommodationWorkZone,
  type: AnimalType,
): AnimalAccommodationWorkZone | null => {
  if (zone.blocked || zone.animalCount >= zone.capacity) return null
  if (zone.zoneType === 'card' && zone.cardId && zone.animalCount === 0 && zone.exclusiveCardZoneLimit !== undefined) {
    const limit = Math.max(0, Math.floor(zone.exclusiveCardZoneLimit))
    const occupied = zones.filter((entry, index) =>
      index !== zoneIndex &&
      entry.zoneType === 'card' &&
      entry.cardId === zone.cardId &&
      entry.animalCount > 0
    ).length
    if (occupied >= limit) return null
  }
  if ('allowedAnimalType' in zone && zone.allowedAnimalType !== null && zone.allowedAnimalType !== type) {
    return null
  }
  if (!allowsMixedAnimalTypes(zone) && zone.animalCount > 0 && (zone.animalCounts[type] ?? 0) <= 0) {
    return null
  }
  const next = candidateZoneWithAnimal(zone, type)
  return computeInvalidAnimalsForZone(state, player, next).length === 0 ? next : null
}

export const canAccommodateAnimalTotals = (
  state: GameState,
  player: PlayerState,
  targetCounts: Partial<Record<AnimalType, number>>,
): boolean => {
  const animals = targetAnimalList(state, targetCounts)
  if (!animals) return false
  const zones = computeAnimalZones(player, state).map((zone) => createAccommodationWorkZone(state, zone))
  const animalKeys = animalKeysForState(state)
  const failedStates = new Set<string>()
  const stateKey = (index: number, currentZones: AnimalAccommodationWorkZone[]) =>
    `${index}|${currentZones.map((zone) =>
      `${zone.animalCount}:${animalKeys.map((key) => zone.animalCounts[key] ?? 0).join(',')}`,
    ).join('|')}`
  const placeFrom = (index: number, currentZones: AnimalAccommodationWorkZone[]): boolean => {
    const type = animals[index]
    if (!type) return true
    const key = stateKey(index, currentZones)
    if (failedStates.has(key)) return false
    for (let i = 0; i < currentZones.length; i += 1) {
      const nextZone = canPlaceAnimalInWorkZone(state, player, currentZones, i, currentZones[i]!, type)
      if (!nextZone) continue
      const nextZones = [...currentZones]
      nextZones[i] = nextZone
      if (placeFrom(index + 1, nextZones)) return true
    }
    failedStates.add(key)
    return false
  }
  return placeFrom(0, zones)
}

export const canAccommodateAllAnimals = (
  state: GameState,
  player: PlayerState,
  animals: readonly AnimalType[],
): boolean => {
  const targetCounts: Partial<Record<AnimalType, number>> = {}
  const enabledAnimals = animalKeysForState(state)
  for (const type of animals) {
    if (!enabledAnimals.includes(type)) return false
    targetCounts[type] = (targetCounts[type] ?? player.resources[type] ?? 0) + 1
  }
  for (const type of enabledAnimals) {
    targetCounts[type] ??= player.resources[type] ?? 0
  }
  return canAccommodateAnimalTotals(state, player, targetCounts)
}

/**
 * Imperative: rebalance animals across zones to fit current capacity.
 *
 * **MUTATES** `player.pastures`, `player.houseAnimal*`,
 * `player.stableAnimals`, card animal-holder storage, and the per-type
 * counters in `player.resources`.
 */
export const enforceAnimalCapacity = (
  player: PlayerState,
  state: GameState = { completedFeedingPhases: 0 } as GameState,
) => {
  const zones = computeAnimalZones(player, state)
  const zoneCapacity = (id: string) => zones.find((z) => z.id === id)?.capacity ?? 0

  const animalKeys = animalKeysForState(state)
  const totals: Partial<Record<AnimalType, number>> = {}
  for (const key of animalKeys) totals[key] = player.resources[key] ?? 0
  const resourcesBefore = { ...totals }
  const reservedCardTotals = reserveCardZoneAnimals(state, player, zones, totals)
  const looseStableKeys = getLooseStableKeys(player)
  const stableAnimals: Record<string, AnimalType | null> = {}
  looseStableKeys.forEach((key) => {
    stableAnimals[key] = player.stableAnimals?.[key] ?? null
  })
  player.pastures = player.pastures.map((pasture) => {
    const capacity = zoneCapacity(pasture.id)
    if (pasture.animalType) {
      const remaining = totals[pasture.animalType] ?? 0
      const count = Math.min(remaining, capacity)
      totals[pasture.animalType] = remaining - count
      return {
        ...pasture,
        animalCount: count,
        animalType: count > 0 ? pasture.animalType : null,
      }
    }
    return { ...pasture, animalCount: 0, animalType: null }
  })
  const houseCapacity = zoneCapacity('house')
  const houseCount =
    player.houseAnimalType && (totals[player.houseAnimalType] ?? 0) > 0
      ? Math.min(houseCapacity, totals[player.houseAnimalType] ?? 0)
      : 0
  if (player.houseAnimalType) {
    totals[player.houseAnimalType] = (totals[player.houseAnimalType] ?? 0) - houseCount
  }
  player.houseAnimalCount = houseCount
  if (houseCount === 0) {
    player.houseAnimalType = null
  }
  looseStableKeys.forEach((key) => {
    const type = stableAnimals[key]
    if (!type) return
    const cap = zoneCapacity(`stable:${key}`)
    const remaining = totals[type] ?? 0
    const count = Math.min(remaining, cap)
    totals[type] = remaining - count
    stableAnimals[key] = count > 0 ? type : null
  })
  const fillPasture = (pasture: Pasture, animalType: AnimalType) => {
    const capacity = zoneCapacity(pasture.id)
    const remaining = totals[animalType] ?? 0
    if (remaining <= 0) return pasture
    const count = Math.min(remaining, capacity)
    totals[animalType] = remaining - count
    return {
      ...pasture,
      animalType,
      animalCount: count,
    }
  }
  player.pastures = player.pastures.map((pasture) => {
    if (pasture.animalType) return pasture
    for (const animalType of animalKeys) {
      const next = fillPasture(pasture, animalType)
      if (next.animalType) return next
    }
    return pasture
  })
  if (!player.houseAnimalType) {
    for (const animalType of animalKeys) {
      if ((totals[animalType] ?? 0) <= 0) continue
      player.houseAnimalType = animalType
      player.houseAnimalCount = 1
      totals[animalType] = (totals[animalType] ?? 0) - 1
      break
    }
  }
  looseStableKeys.forEach((key) => {
    if (stableAnimals[key]) return
    for (const animalType of animalKeys) {
      if ((totals[animalType] ?? 0) <= 0) continue
      stableAnimals[key] = animalType
      totals[animalType] = (totals[animalType] ?? 0) - 1
      return
    }
  })
  player.stableAnimals = stableAnimals
  for (const animalType of animalKeys) {
    player.resources[animalType] = reservedCardTotals[animalType] ?? 0
    player.resources[animalType] += player.pastures
      .filter((pasture) => pasture.animalType === animalType)
      .reduce((sum, pasture) => sum + pasture.animalCount, 0)
    if (player.houseAnimalType === animalType) {
      player.resources[animalType] = (player.resources[animalType] ?? 0) + player.houseAnimalCount
    }
    Object.values(stableAnimals).forEach((type) => {
      if (type === animalType) player.resources[animalType] = (player.resources[animalType] ?? 0) + 1
    })
  }
  const removed = createAnimalCounts(state.enableFarmersOfTheMoor === true)
  for (const animalType of animalKeys) {
    const amount = (resourcesBefore[animalType] ?? 0) - (player.resources[animalType] ?? 0)
    if (amount > 0) removed[animalType] = amount
  }
  if (sumAnimalCounts(removed) > 0) notifyAnimalsRemovedFromCardEffects(state, player, removed)

  // Per-card zone validation hook: BGA `getInvalidAnimals($zone, ...)`. We
  // run this for each card-typed zone so card authors can mirror BGA's
  // per-meeple constraint logic (e.g. C11 WildlifeReserve at most 1 of each
  // animal type, C12 CattleFarm dynamic-cap = pasture count). Concrete
  // resource adjustment on hook violations is per-card; the helper only
  // surfaces the invalid list so cards can react in their own listeners.
  const zonesForHook = computeAnimalZones(player, state)
  for (const zone of zonesForHook) {
    if (zone.zoneType !== 'card') continue
    computeInvalidAnimalsForZone(state, player, zone)
  }
}

// ---------------------------------------------------------------------------
// AnimalZones — domain facade class.
// ---------------------------------------------------------------------------

/**
 * View of a player's animal zones (pastures + house + loose stables +
 * card-typed zones). Owns the computation previously delegated to
 * `actions/helpers/animal-zones.ts`.
 *
 * Mutation contract: query methods do NOT mutate the underlying
 * `PlayerState`. Only `enforceCapacity()` mutates by design.
 */
export class AnimalZones {
  private readonly player: PlayerState
  private readonly state: GameState

  constructor(player: PlayerState, state: GameState) {
    this.player = player
    this.state = state
  }

  /** All zones (pastures, house, loose stables, card zones) the player has. */
  zones(): AnimalZone[] {
    return computeAnimalZones(this.player, this.state)
  }

  /**
   * Count of a given animal type, or all assigned animals if no type given.
   */
  countAnimals(type?: AnimalType): number {
    if (type === undefined) {
      return getAssignedAnimalCount(this.player)
    }
    return (this.player.resources[type] as number) ?? 0
  }

  /** Total capacity across all zones (used for room-for-X questions). */
  totalCapacity(): number {
    return getTotalAnimalCapacity(this.player, this.state)
  }

  /**
   * Per-type remaining capacity (animals that still fit on the board).
   * NOTE: total capacity is type-agnostic in BGA; we report the same
   * `free` value for each animal type.
   */
  capacityRemaining(): Record<AnimalType, number> {
    const total = this.totalCapacity()
    const assigned = getAssignedAnimalCount(this.player)
    const free = Math.max(0, total - assigned)
    const result = {} as Record<AnimalType, number>
    for (const animalType of animalKeysForState(this.state)) result[animalType] = free
    return result
  }

  /**
   * Imperative: rebalance animals across zones to fit current capacity.
   * **MUTATES** `player.pastures`, `player.houseAnimal*`,
   * `player.stableAnimals`, and the per-type counters in `player.resources`.
   */
  enforceCapacity(): void {
    enforceAnimalCapacity(this.player, this.state)
  }

  /** Capacity of a specific pasture zone (0 if not a pasture). */
  pastureCapacity(zoneId: string): number {
    const pasture = (this.player.pastures ?? []).find((p) => p.id === zoneId)
    if (!pasture) return 0
    return getPastureCapacity(pasture)
  }

  /** Loose-stable tile keys (stables not inside any pasture). */
  looseStableKeys(): string[] {
    return getLooseStableKeys(this.player)
  }

  /**
   * Per-card invalid-animals hook for a given zone. Returns the list of
   * meeple records flagged invalid by the card (e.g. C11 WildlifeReserve).
   * Returns empty list if zone is unknown or not card-typed.
   */
  invalidAnimalsForZone(zoneId: string) {
    const zone = this.zones().find((z) => z.id === zoneId)
    if (!zone) return []
    return computeInvalidAnimalsForZone(this.state, this.player, zone)
  }
}
