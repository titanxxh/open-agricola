import type { GameState, PlayerState, Pasture } from '../contract/types.ts'
import { positionKey } from '../domain/farm.ts'
import { getCardEffect, type Meeple, type PastureCapacityModifier } from '../cards/card-effects.ts'
import { playerHasCardCapability } from '../cards/helpers/card-type.ts'

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
  animalType?: string | null
  animalCount?: number
  cardId?: string
  pastureIndex?: number
}

type AnimalType = 'sheep' | 'boar' | 'cattle'

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
        animalType: (pasture.animalType as string) ?? null,
        animalCount: pasture.animalCount,
        pastureIndex: index,
      }
    }),
    {
      id: 'house',
      zoneType: 'house' as const,
      capacity: 1,
      houseAnimalZone: true,
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
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (effect?.onComputeAnimalZones) {
      const result = effect.onComputeAnimalZones(player, zones, state)
      if (Array.isArray(result)) {
        zones.push(...result)
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
      console.warn(
        `[animal-zones] custom card ${zone.cardId} getInvalidAnimals threw, skipping:`,
        err,
      )
      return []
    }
    throw err
  }
}

/**
 * Imperative: rebalance animals across zones to fit current capacity.
 *
 * **MUTATES** `player.pastures`, `player.houseAnimal*`,
 * `player.stableAnimals`, and the per-type counters in `player.resources`.
 */
export const enforceAnimalCapacity = (
  player: PlayerState,
  state: GameState = { completedFeedingPhases: 0 } as GameState,
) => {
  const zones = computeAnimalZones(player, state)
  const zoneCapacity = (id: string) => zones.find((z) => z.id === id)?.capacity ?? 0

  const totals = {
    sheep: player.resources.sheep,
    boar: player.resources.boar,
    cattle: player.resources.cattle,
  }
  const looseStableKeys = getLooseStableKeys(player)
  const stableAnimals: Record<string, AnimalType | null> = {}
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
  const fillPasture = (pasture: Pasture, animalType: AnimalType) => {
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
  capacityRemaining(): { sheep: number; boar: number; cattle: number } {
    const total = this.totalCapacity()
    const assigned = getAssignedAnimalCount(this.player)
    const free = Math.max(0, total - assigned)
    return { sheep: free, boar: free, cattle: free }
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
