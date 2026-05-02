import type { PlayerState, Pasture, GameState } from '../../game/types'
import { positionKey } from '../../game/farm'
import { getCardEffect, type Meeple } from '../../cards/card-effects'

export type AnimalZone = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable' | 'card'
  capacity: number
  blocked?: boolean
  animalType?: string | null
  animalCount?: number
  cardId?: string
  pastureIndex?: number
}

export const getPastureCapacity = (pasture: Pasture) =>
  pasture.size * 2 * Math.pow(2, pasture.stables)

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

export const computeAnimalZones = (player: PlayerState): AnimalZone[] => {
  const zones: AnimalZone[] = [
    ...player.pastures.map((pasture, index) => ({
      id: pasture.id,
      zoneType: 'pasture' as const,
      capacity: getPastureCapacity(pasture),
      animalType: (pasture.animalType as string) ?? null,
      animalCount: pasture.animalCount,
      pastureIndex: index,
    })),
    {
      id: 'house',
      zoneType: 'house' as const,
      capacity: 1,
      animalType: (player.houseAnimalType as string) ?? null,
      animalCount: player.houseAnimalCount ?? 0,
    },
    ...getLooseStableKeys(player).map((key) => ({
      id: `stable:${key}`,
      zoneType: 'stable' as const,
      capacity: 1,
      animalType: (player.stableAnimals?.[key] as string) ?? null,
      animalCount: player.stableAnimals?.[key] ? 1 : 0,
    })),
  ]
  const allCards = [
    ...(player.minorPlayed ?? []),
    ...(player.occupationPlayed ?? []),
    ...(player.improvements ?? []),
  ]
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (effect?.onComputeAnimalZones) {
      const result = effect.onComputeAnimalZones(player, zones)
      if (Array.isArray(result)) {
        zones.push(...result)
      }
    }
  }
  zones.forEach((zone) => {
    if (zone.blocked) {
      zone.capacity = 0
    }
  })
  return zones
}

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

export const getTotalAnimalCapacity = (player: PlayerState) =>
  computeAnimalZones(player).reduce((sum, zone) => sum + zone.capacity, 0)

/**
 * Expand an `(animalType, animalCount)` zone into a per-meeple list so it can
 * be passed to `CardEffect.getInvalidAnimals`. If the zone has no animal
 * data, returns an empty list.
 */
const expandZoneToMeeples = (zone: AnimalZone): Meeple[] => {
  const type = zone.animalType
  const count = zone.animalCount ?? 0
  if (!type || count <= 0) return []
  if (type !== 'sheep' && type !== 'boar' && type !== 'cattle') return []
  return Array.from({ length: count }, () => ({ type } as Meeple))
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
      console.warn(`[animal-zones] custom card ${zone.cardId} getInvalidAnimals threw, skipping:`, err)
      return []
    }
    throw err
  }
}

export const enforceAnimalCapacity = (player: PlayerState) => {
  const zones = computeAnimalZones(player)
  const zoneCapacity = (id: string) => zones.find((z) => z.id === id)?.capacity ?? 0

  const totals = {
    sheep: player.resources.sheep,
    boar: player.resources.boar,
    cattle: player.resources.cattle,
  }
  const looseStableKeys = getLooseStableKeys(player)
  const stableAnimals: Record<string, 'sheep' | 'boar' | 'cattle' | null> = {}
  looseStableKeys.forEach((key) => {
    stableAnimals[key] = player.stableAnimals?.[key] ?? null
  })
  player.pastures = player.pastures.map((pasture) => {
    const capacity = zoneCapacity(pasture.id)
    if (pasture.animalType) {
      const remaining = totals[pasture.animalType]
      const count = Math.min(remaining, capacity)
      totals[pasture.animalType] -= count
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
    player.houseAnimalType && totals[player.houseAnimalType] > 0
      ? Math.min(houseCapacity, totals[player.houseAnimalType])
      : 0
  if (player.houseAnimalType) {
    totals[player.houseAnimalType] -= houseCount
  }
  player.houseAnimalCount = houseCount
  if (houseCount === 0) {
    player.houseAnimalType = null
  }
  looseStableKeys.forEach((key) => {
    const type = stableAnimals[key]
    if (!type) return
    const cap = zoneCapacity(`stable:${key}`)
    const remaining = totals[type]
    const count = Math.min(remaining, cap)
    totals[type] -= count
    stableAnimals[key] = count > 0 ? type : null
  })
  const fillPasture = (
    pasture: Pasture,
    animalType: 'sheep' | 'boar' | 'cattle',
  ) => {
    const capacity = zoneCapacity(pasture.id)
    const remaining = totals[animalType]
    if (remaining <= 0) return pasture
    const count = Math.min(remaining, capacity)
    totals[animalType] -= count
    return {
      ...pasture,
      animalType,
      animalCount: count,
    }
  }
  player.pastures = player.pastures.map((pasture) => {
    if (pasture.animalType) return pasture
    let next = fillPasture(pasture, 'sheep')
    if (next.animalType) return next
    next = fillPasture(pasture, 'boar')
    if (next.animalType) return next
    next = fillPasture(pasture, 'cattle')
    return next
  })
  if (!player.houseAnimalType) {
    if (totals.sheep > 0) {
      player.houseAnimalType = 'sheep'
      player.houseAnimalCount = 1
      totals.sheep -= 1
    } else if (totals.boar > 0) {
      player.houseAnimalType = 'boar'
      player.houseAnimalCount = 1
      totals.boar -= 1
    } else if (totals.cattle > 0) {
      player.houseAnimalType = 'cattle'
      player.houseAnimalCount = 1
      totals.cattle -= 1
    }
  }
  looseStableKeys.forEach((key) => {
    if (stableAnimals[key]) return
    if (totals.sheep > 0) {
      stableAnimals[key] = 'sheep'
      totals.sheep -= 1
      return
    }
    if (totals.boar > 0) {
      stableAnimals[key] = 'boar'
      totals.boar -= 1
      return
    }
    if (totals.cattle > 0) {
      stableAnimals[key] = 'cattle'
      totals.cattle -= 1
    }
  })
  player.stableAnimals = stableAnimals
  player.resources.sheep = player.pastures
    .filter((pasture) => pasture.animalType === 'sheep')
    .reduce((sum, pasture) => sum + pasture.animalCount, 0)
  if (player.houseAnimalType === 'sheep') {
    player.resources.sheep += player.houseAnimalCount
  }
  Object.values(stableAnimals).forEach((type) => {
    if (type === 'sheep') player.resources.sheep += 1
  })
  player.resources.boar = player.pastures
    .filter((pasture) => pasture.animalType === 'boar')
    .reduce((sum, pasture) => sum + pasture.animalCount, 0)
  if (player.houseAnimalType === 'boar') {
    player.resources.boar += player.houseAnimalCount
  }
  Object.values(stableAnimals).forEach((type) => {
    if (type === 'boar') player.resources.boar += 1
  })
  player.resources.cattle = player.pastures
    .filter((pasture) => pasture.animalType === 'cattle')
    .reduce((sum, pasture) => sum + pasture.animalCount, 0)
  if (player.houseAnimalType === 'cattle') {
    player.resources.cattle += player.houseAnimalCount
  }
  Object.values(stableAnimals).forEach((type) => {
    if (type === 'cattle') player.resources.cattle += 1
  })

  // Per-card zone validation hook: BGA `getInvalidAnimals($zone, ...)`. We
  // run this for each card-typed zone so card authors can mirror BGA's
  // per-meeple constraint logic (e.g. C11 WildlifeReserve at most 1 of each
  // animal type, C12 CattleFarm dynamic-cap = pasture count). Concrete
  // resource adjustment on hook violations is per-card; the helper only
  // surfaces the invalid list so cards can react in their own listeners.
  const zonesForHook = computeAnimalZones(player)
  const stateStub = {} as GameState
  for (const zone of zonesForHook) {
    if (zone.zoneType !== 'card') continue
    computeInvalidAnimalsForZone(stateStub, player, zone)
  }
}
