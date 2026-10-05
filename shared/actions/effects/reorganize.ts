import { buildAnimalReorgRequest } from '../../domain/animal-reorg'
import { playerBoard } from '../../domain'
import { copyHistoryRecordIdentity } from '../../session/history-streams'
import { syncHarvestBreedPlacement } from '../../domain/harvest-breed-placement'
import type {
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  InteractionAnimalReorgZone,
  PlayerState,
  Resource,
} from '../../contract/types'
import { animalKeysForState, type AnimalKey } from '../../contract/animals'
import {
  areRequiredEmptyZoneGroupsSatisfied,
  buildCardAnimalZoneId,
  getAllowedAnimalTypesForZone,
  normalizeAnimalCountsForZone,
  readAnimalCountsForZoneAssignment,
  syncCardAnimalStorage,
  type AnimalZone,
} from '../../domain/animal-zones'
import {
  createAnimalCounts,
  readAnimalHolderCounts,
  singleAnimalType,
  sumAnimalCounts,
  writeAnimalHolderCounts,
} from '../../domain/animal-holder-state'
import {
  getAssignedAnimalsByType,
  subtractAnimalsFromBoard,
} from '../../domain/animals'
import { findPlayerById } from '../../domain/player'
import { notifyAnimalsRemovedFromCardEffects } from '../../cards/card-effects'

export type ReorganizeTrigger =
  | 'anytime'
  | 'returning-home'
  | 'harvest-breed'
  | 'round-end'

export type ZoneAssignment = {
  id: string
  zoneType: InteractionAnimalReorgZone['zoneType']
  cardId?: string
  ownerPlayerId?: string
  animalOwnerPlayerId?: string
  animalType: AnimalKey | null
  animalCount: number
  animalCounts?: Partial<Record<AnimalKey, number>>
}

const addAnimalCounts = (
  target: ReturnType<typeof createAnimalCounts>,
  counts: Partial<Record<AnimalKey, number>>,
  keys: readonly AnimalKey[],
) => {
  for (const key of keys) target[key] = (target[key] ?? 0) + Math.max(0, counts[key] ?? 0)
}

const writeCountsByZone = (
  extraData: Record<string, unknown>,
  entries: Map<string, Partial<Record<AnimalKey, number>>>,
  zonesById: Map<string, AnimalZone>,
  allowedTypesByZone: Map<string, AnimalKey[]>,
  preservedEntries: Record<string, unknown> = {},
) => {
  const next: Record<string, unknown> = { ...preservedEntries }
  for (const [zoneId, counts] of entries) {
    if (sumAnimalCounts(counts) <= 0) continue
    const slot: Record<string, unknown> = {}
    writeAnimalHolderCounts(slot, counts)
    const zone = zonesById.get(zoneId)
    if (zone) {
      slot.capacity = zone.capacity
      if (zone.cardId) slot.cardId = zone.cardId
      if (zone.ownerPlayerId) slot.ownerPlayerId = zone.ownerPlayerId
      if (zone.animalOwnerPlayerId) slot.animalOwnerPlayerId = zone.animalOwnerPlayerId
      if (zone.allowedAnimalType !== undefined) slot.allowedAnimalType = zone.allowedAnimalType
      if (zone.farmPosition) slot.farmPosition = zone.farmPosition
    }
    const allowedAnimalTypes = allowedTypesByZone.get(zoneId)
    if (allowedAnimalTypes && allowedAnimalTypes.length > 0) {
      slot.allowedAnimalTypes = allowedAnimalTypes
    }
    if (Object.keys(slot).length > 0) next[zoneId] = slot
  }
  if (Object.keys(next).length > 0) extraData.animalCountsByZone = next
  else delete extraData.animalCountsByZone
  delete extraData.animalCounts
  delete extraData.animalType
  delete extraData.held
}

const trimVisibleAnimalsToAvailableTotals = (
  state: GameState,
  player: PlayerState,
  resourceTotalsBefore: Partial<Record<AnimalKey, number>>,
  visibleTotals: Partial<Record<AnimalKey, number>>,
) => {
  const animalKeys = animalKeysForState(state)
  const assignedCounts = getAssignedAnimalsByType(player, state)
  const clampedVisibleTotals = { ...visibleTotals }
  const excessCounts = createAnimalCounts(state.enableFarmersOfTheMoor === true)
  for (const animal of animalKeys) {
    const visibleLimit = Math.max(0, resourceTotalsBefore[animal] ?? 0)
    const excess = (visibleTotals[animal] ?? 0) - visibleLimit
    if (excess <= 0) continue
    clampedVisibleTotals[animal] = visibleLimit
    const assignedExcess = Math.min(assignedCounts[animal] ?? 0, excess)
    if (assignedExcess > 0) excessCounts[animal] = assignedExcess
  }
  if (sumAnimalCounts(excessCounts) > 0) subtractAnimalsFromBoard(player, excessCounts, state)
  return clampedVisibleTotals
}

const storagePlayerForZone = (
  state: GameState,
  player: PlayerState,
  zone: AnimalZone,
): PlayerState => zone.ownerPlayerId
  ? findPlayerById(state, zone.ownerPlayerId) ?? player
  : player

const animalOwnerIdFromZoneId = (zoneId: string): string | undefined =>
  zoneId.match(/:animalOwner:([^:]+)$/)?.[1]

const preservedHostedZoneEntries = (
  existing: unknown,
  currentAnimalOwnerPlayerId: string,
  activeZoneIds: Set<string>,
): Record<string, unknown> => {
  const extraData = (existing as { extraData?: unknown } | undefined)?.extraData
  if (!extraData || typeof extraData !== 'object') return {}
  const zoneCounts = (extraData as { animalCountsByZone?: unknown }).animalCountsByZone
  if (!zoneCounts || typeof zoneCounts !== 'object') return {}
  const preserved: Record<string, unknown> = {}
  for (const [zoneId, entry] of Object.entries(zoneCounts)) {
    if (activeZoneIds.has(zoneId)) continue
    if (!entry || typeof entry !== 'object') continue
    const animalOwnerPlayerId = typeof (entry as { animalOwnerPlayerId?: unknown }).animalOwnerPlayerId === 'string'
      ? (entry as { animalOwnerPlayerId: string }).animalOwnerPlayerId
      : animalOwnerIdFromZoneId(zoneId)
    if (!animalOwnerPlayerId) continue
    if (animalOwnerPlayerId === currentAnimalOwnerPlayerId) continue
    preserved[zoneId] = entry
  }
  return preserved
}

export const applyReorganizeMutate = (
  state: GameState,
  player: PlayerState,
  zones: ZoneAssignment[],
): void => {
  const idx = state.players.indexOf(player)
  const computed = playerBoard(state, idx).animals.zones()
  const cap = (id: string) => computed.find((z) => z.id === id)?.capacity ?? 0
  const animalKeys = animalKeysForState(state)
  const resourceTotalsBefore = createAnimalCounts(state.enableFarmersOfTheMoor === true)
  for (const animal of animalKeys) resourceTotalsBefore[animal] = player.resources[animal] ?? 0
  const normalizeAnimalType = (type: AnimalKey | null | undefined): AnimalKey | null =>
    type && animalKeys.includes(type) ? type : null
  const cardAssignmentForZone = (zoneId: string): unknown => {
    const assignments = zones.filter((z) => z.zoneType === 'card' && z.id === zoneId)
    if (assignments.length <= 1) return assignments[0]
    const animalCounts = createAnimalCounts(state.enableFarmersOfTheMoor === true)
    for (const assignment of assignments) {
      addAnimalCounts(animalCounts, readAnimalCountsForZoneAssignment(assignment), animalKeys)
    }
    return { animalCounts }
  }

  const pastureZones = zones.filter((z) => z.zoneType === 'pasture')
  player.pastures = player.pastures.map((p) => {
    const a = pastureZones.find((z) => z.id === p.id)
    const animalType = normalizeAnimalType(a?.animalType)
    if (!a || !animalType) return { ...p, animalType: null, animalCount: 0 }
    const count = Math.max(0, Math.min(cap(p.id), a.animalCount))
    return { ...p, animalType: count > 0 ? animalType : null, animalCount: count }
  })

  const houseZone = zones.find((z) => z.zoneType === 'house')
  const houseAnimalType = normalizeAnimalType(houseZone?.animalType)
  player.houseAnimalType = houseAnimalType
  player.houseAnimalCount = houseAnimalType
    ? Math.max(0, Math.min(cap('house'), Math.floor(houseZone?.animalCount ?? 0)))
    : 0

  const stable: Record<string, AnimalKey | null> = {}
  zones
    .filter((z) => z.zoneType === 'stable')
    .forEach((z) => {
      stable[z.id.replace('stable:', '')] = normalizeAnimalType(z.animalType)
    })
  player.stableAnimals = stable

  const computedZonesById = new Map(computed.map((zone) => [zone.id, zone]))
  const cardZonesByStorageKey = new Map<string, { cardId: string; storagePlayer: PlayerState; zones: AnimalZone[] }>()
  const keyedCardZoneIds = new Set(
    computed
      .filter((z) => z.zoneType === 'card' && z.cardId)
      .map((zone) => zone.id),
  )
  computed
    .filter((z) => z.zoneType === 'card' && z.cardId)
    .forEach((zone) => {
      const storagePlayer = storagePlayerForZone(state, player, zone)
      const key = `${storagePlayer.id}:${zone.cardId!}`
      const group = cardZonesByStorageKey.get(key) ?? { cardId: zone.cardId!, storagePlayer, zones: [] }
      group.zones.push(zone)
      cardZonesByStorageKey.set(key, group)
    })
  const cardCountsByStorageKey = new Map<string, ReturnType<typeof createAnimalCounts>>()
  for (const { cardId, storagePlayer, zones: cardZones } of cardZonesByStorageKey.values()) {
    const existing = storagePlayer.cardStates?.[cardId]
    const assignedCounts = createAnimalCounts(state.enableFarmersOfTheMoor === true)
    const countsByZone = new Map<string, ReturnType<typeof createAnimalCounts>>()
    const allowedTypesByZone = new Map<string, AnimalKey[]>()
    const useZoneStorage = cardZones.length > 1 || cardZones.some((zone) =>
      zone.id !== buildCardAnimalZoneId(cardId) || zone.farmPosition
    )
    const exclusiveLimit = Math.max(
      0,
      Math.floor(cardZones.find((zone) => zone.exclusiveCardZoneLimit !== undefined)?.exclusiveCardZoneLimit ?? Number.POSITIVE_INFINITY),
    )
    let occupiedExclusiveZones = 0
    for (const zone of cardZones) {
      allowedTypesByZone.set(zone.id, getAllowedAnimalTypesForZone(state, player, zone))
      const assigned = cardAssignmentForZone(zone.id)
      let counts = normalizeAnimalCountsForZone(state, player, zone, assigned)
      if (sumAnimalCounts(counts) > 0 && occupiedExclusiveZones >= exclusiveLimit) {
        counts = createAnimalCounts(state.enableFarmersOfTheMoor === true)
      }
      if (sumAnimalCounts(counts) > 0 && Number.isFinite(exclusiveLimit)) {
        occupiedExclusiveZones += 1
      }
      countsByZone.set(zone.id, counts)
      addAnimalCounts(assignedCounts, counts, animalKeys)
    }
    cardCountsByStorageKey.set(`${storagePlayer.id}:${cardId}`, assignedCounts)
    if (typeof existing?.counters?.held === 'number') continue
    if (sumAnimalCounts(assignedCounts) <= 0 && !existing?.extraData) continue
    storagePlayer.cardStates ??= {}
    const nextState = { ...(storagePlayer.cardStates[cardId] ?? {}) }
    const extraData = { ...((nextState.extraData as Record<string, unknown> | undefined) ?? {}) }
    if (useZoneStorage) {
      const activeZoneIds = new Set(cardZones.map((zone) => zone.id))
      writeCountsByZone(
        extraData,
        countsByZone,
        new Map(cardZones.map((zone) => [zone.id, zone])),
        allowedTypesByZone,
        preservedHostedZoneEntries(existing, player.id, activeZoneIds),
      )
    } else writeAnimalHolderCounts(extraData, assignedCounts)
    nextState.extraData = extraData
    storagePlayer.cardStates[cardId] = nextState
  }
  for (const [cardId, existing] of Object.entries(player.cardStates ?? {})) {
    if ([...cardZonesByStorageKey.values()].some((entry) => entry.storagePlayer.id === player.id && entry.cardId === cardId)) continue
    if (typeof existing?.counters?.held === 'number') continue
    const existingExtraData = existing?.extraData as Record<string, unknown> | undefined
    const zoneCounts = existingExtraData?.animalCountsByZone
    const hasZoneCounts = !!zoneCounts && typeof zoneCounts === 'object' && Object.keys(zoneCounts).length > 0
    if (sumAnimalCounts(readAnimalHolderCounts(existing?.extraData)) <= 0 && !hasZoneCounts) continue
    const nextState = { ...existing }
    const extraData = { ...((nextState.extraData as Record<string, unknown> | undefined) ?? {}) }
    writeAnimalHolderCounts(extraData, createAnimalCounts())
    delete extraData.animalCountsByZone
    const preserved = preservedHostedZoneEntries(existing, player.id, new Set())
    if (Object.keys(preserved).length > 0) extraData.animalCountsByZone = preserved
    nextState.extraData = extraData
    player.cardStates![cardId] = nextState
  }

  const visibleTotals = createAnimalCounts(state.enableFarmersOfTheMoor === true)
  zones
    .filter((zone) => zone.zoneType !== 'card' || !keyedCardZoneIds.has(zone.id))
    .forEach((zone) => {
      if (zone.zoneType === 'card') {
        const baseZone = computedZonesById.get(zone.id)
        if (baseZone) {
          addAnimalCounts(visibleTotals, normalizeAnimalCountsForZone(state, player, baseZone, zone), animalKeys)
          return
        }
      }
      addAnimalCounts(visibleTotals, readAnimalCountsForZoneAssignment(zone), animalKeys)
    })
  for (const counts of cardCountsByStorageKey.values()) addAnimalCounts(visibleTotals, counts, animalKeys)
  const finalVisibleTotals = trimVisibleAnimalsToAvailableTotals(
    state,
    player,
    resourceTotalsBefore,
    visibleTotals,
  )
  for (const animal of animalKeys) player.resources[animal] = finalVisibleTotals[animal] ?? 0
  const removed = discardedAnimals(state, resourceTotalsBefore, finalVisibleTotals)
  if (Object.keys(removed).length > 0) notifyAnimalsRemovedFromCardEffects(state, player, removed)
}

const animalTotals = (state: GameState, player: PlayerState): Partial<Pick<Resource, AnimalKey>> => {
  const totals: Partial<Pick<Resource, AnimalKey>> = {}
  for (const type of animalKeysForState(state)) totals[type] = player.resources[type] ?? 0
  return totals
}

const discardedAnimals = (
  state: GameState,
  before: Partial<Pick<Resource, AnimalKey>>,
  after: Partial<Pick<Resource, AnimalKey>>,
): Partial<Resource> => {
  const discarded: Partial<Resource> = {}
  for (const type of animalKeysForState(state)) {
    const amount = (before[type] ?? 0) - (after[type] ?? 0)
    if (amount > 0) discarded[type] = amount
  }
  return discarded
}

const positiveAnimals = (
  state: GameState,
  animals: Partial<Pick<Resource, AnimalKey>>,
): Partial<Pick<Resource, AnimalKey>> => {
  const result: Partial<Pick<Resource, AnimalKey>> = {}
  for (const type of animalKeysForState(state)) {
    const amount = animals[type] ?? 0
    if (amount > 0) result[type] = amount
  }
  return result
}

const validateAssignments = (
  state: GameState,
  player: PlayerState,
  computed: AnimalZone[],
  assignments: unknown[],
): ZoneAssignment[] | undefined => {
  const keys = animalKeysForState(state)
  const totals = createAnimalCounts(state.enableFarmersOfTheMoor === true)
  const byId = new Map<string, ZoneAssignment>()
  for (const value of assignments) {
    if (!value || typeof value !== 'object') return
    const assignment = value as ZoneAssignment
    const zone = computed.find((candidate) => candidate.id === assignment.id)
    if (!zone || byId.has(zone.id) || zone.zoneType !== assignment.zoneType) return
    if (!Number.isSafeInteger(assignment.animalCount) || assignment.animalCount < 0) return
    if (assignment.animalCount > zone.capacity) return
    if (assignment.animalType !== null && !keys.includes(assignment.animalType)) return
    if (assignment.animalCounts !== undefined) {
      if (!assignment.animalCounts || typeof assignment.animalCounts !== 'object' || Array.isArray(assignment.animalCounts)) return
      if (Object.entries(assignment.animalCounts).some(([key, count]) =>
        !keys.includes(key as AnimalKey) || !Number.isSafeInteger(count) || count < 0,
      )) return
      if (sumAnimalCounts(assignment.animalCounts) !== assignment.animalCount) return
      if (assignment.animalType && assignment.animalCount > 0 && assignment.animalCounts[assignment.animalType] !== assignment.animalCount) return
    }
    const counts = readAnimalCountsForZoneAssignment(assignment)
    if (sumAnimalCounts(counts) !== assignment.animalCount) return
    const normalized = normalizeAnimalCountsForZone(
      state, player, zone.zoneType === 'card' ? zone : { ...zone, animalType: null }, assignment,
    )
    if (keys.some((key) => (counts[key] ?? 0) !== (normalized[key] ?? 0))) return
    addAnimalCounts(totals, counts, keys)
    byId.set(zone.id, { ...assignment, animalType: singleAnimalType(counts) })
  }
  if (keys.some((key) => (totals[key] ?? 0) > (player.resources[key] ?? 0))) return
  const finalZones = computed.map((zone) => ({
    ...zone,
    animalCount: byId.get(zone.id)?.animalCount ?? 0,
    animalCounts: readAnimalCountsForZoneAssignment(byId.get(zone.id)),
  }))
  if (!areRequiredEmptyZoneGroupsSatisfied(finalZones)) return
  for (const zone of finalZones) {
    if (zone.exclusiveCardZoneLimit === undefined) continue
    const occupied = finalZones.filter((candidate) =>
      candidate.cardId === zone.cardId && candidate.ownerPlayerId === zone.ownerPlayerId && candidate.animalCount > 0,
    ).length
    if (occupied > zone.exclusiveCardZoneLimit) return
  }
  return [...byId.values()]
}

export const reorganizeAction: ActionDefinition = {
  id: 'reorganize',
  nameKey: 'actions.reorganize.name',
  descriptionKey: 'actions.reorganize.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  costPreview: {
    isStructurallyPossible: () => true,
    getBaseCost: () => ({}),
  },
  execute: (ctx): ActionExecutionResult => {
    const trigger = (ctx.actionContext?.trigger as ReorganizeTrigger) ?? 'anytime'
    syncCardAnimalStorage(ctx.state, ctx.player)
    return {
      type: 'request',
      request: buildAnimalReorgRequest(ctx.state, ctx.player, ctx.actionContext?.prefill !== false),
      promptKey: 'ui.interactionAnimalReorg',
      promptParams: { trigger },
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') {
      return {
        type: 'fail',
        errorKey: 'log.reorganizeFail',
        recoverable: true,
      }
    }
    const rawPayload = payload as unknown
    const assignments = Array.isArray(rawPayload)
      ? rawPayload
      : typeof rawPayload === 'object' && rawPayload !== null && Array.isArray((rawPayload as { zones?: unknown }).zones)
        ? (rawPayload as { zones: ZoneAssignment[] }).zones
        : undefined
    if (!assignments) return { type: 'fail', errorKey: 'log.reorganizeFail', recoverable: true }
    const playerIndex = ctx.state.players.indexOf(ctx.player)
    const computedZones = playerBoard(ctx.state, playerIndex).animals.zones()
    const zones = validateAssignments(ctx.state, ctx.player, computedZones, assignments)
    if (!zones) {
      return { type: 'fail', errorKey: 'log.reorganizeFail', recoverable: true }
    }
    const newlyPlacedOnFarmyard: Partial<Record<AnimalKey, number>> = {}
    const assignmentsById = new Map(zones.map((zone) => [zone.id, zone]))
    for (const animal of animalKeysForState(ctx.state)) {
      let farmyardAdded = 0
      let movedExisting = 0
      for (const zone of computedZones) {
        const previous = readAnimalCountsForZoneAssignment(zone)[animal] ?? 0
        const next = readAnimalCountsForZoneAssignment(assignmentsById.get(zone.id))[animal] ?? 0
        movedExisting += Math.max(0, previous - next)
        if (zone.zoneType !== 'card' || (zone.farmPosition && zone.ownerPlayerId === ctx.player.id)) {
          farmyardAdded += Math.max(0, next - previous)
        }
      }
      const added = Math.max(0, farmyardAdded - movedExisting)
      if (added > 0) newlyPlacedOnFarmyard[animal] = added
    }
    const before = animalTotals(ctx.state, ctx.player)
    const placement = syncHarvestBreedPlacement(ctx.state, ctx.player)
    applyReorganizeMutate(ctx.state, ctx.player, zones)
    const after = animalTotals(ctx.state, ctx.player)
    const summary = ctx.state.harvestBreedSummary?.[ctx.player.id]
    if (placement && summary) {
      const previousResources = summary.resources
      summary.resources = { ...previousResources }
      for (const animal of animalKeysForState(ctx.state)) {
        if ((after[animal] ?? 0) < (placement.minimums[animal] ?? Infinity)) {
          delete summary.resources[animal]
          delete placement.minimums[animal]
        }
      }
      ctx.state.events = ctx.state.events.map(event => event.type === 'farm.animalBred' && event.animals === previousResources
        ? copyHistoryRecordIdentity(event, { ...event, animals: { ...summary.resources } }) : event)
      placement.animalCounts = after
      summary.animalTypes = Object.keys(summary.resources).length
      summary.animalCount = sumAnimalCounts(summary.resources)
    }
    if (ctx.actionContext?.harvestBreedPlacementMinimums) delete ctx.state.harvestBreedPlacement?.[ctx.player.id]
    const assigned = positiveAnimals(ctx.state, after)
    if (Object.keys(assigned).length > 0) {
      ctx.eventSink?.emit<'farm.animalMoved'>({
        type: 'farm.animalMoved',
        animals: assigned,
        newlyPlacedOnFarmyard,
      })
    }
    const discarded = discardedAnimals(ctx.state, before, after)
    if (Object.keys(discarded).length > 0) {
      ctx.eventSink?.emit<'farm.animalDiscarded'>({
        type: 'farm.animalDiscarded',
        animals: discarded,
        reason: 'noRoom',
      })
    }
    return { type: 'ok' }
  },
}
