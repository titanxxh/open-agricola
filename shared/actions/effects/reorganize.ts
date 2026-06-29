import type {
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  InteractionAnimalReorgZone,
  PlayerState,
  Resource,
} from '../../contract/types'
import { animalKeysForState, type AnimalKey } from '../../contract/animals'
import { playerBoard } from '../../domain'
import {
  buildCardAnimalZoneId,
  type AnimalZone,
  normalizeAnimalCountsForZone,
  readAnimalCountsForZoneAssignment,
} from '../../domain/animal-zones'
import {
  createAnimalCounts,
  readAnimalHolderCounts,
  sumAnimalCounts,
  writeAnimalHolderCounts,
} from '../../domain/animal-holder-state'

export type ReorganizeTrigger =
  | 'anytime'
  | 'returning-home'
  | 'harvest-breed'
  | 'round-end'

export type ZoneAssignment = {
  id: string
  zoneType: InteractionAnimalReorgZone['zoneType']
  cardId?: string
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
) => {
  const next: Record<string, unknown> = {}
  for (const [zoneId, counts] of entries) {
    if (sumAnimalCounts(counts) <= 0) continue
    const slot: Record<string, unknown> = {}
    writeAnimalHolderCounts(slot, counts)
    const zone = zonesById.get(zoneId)
    if (zone) {
      slot.capacity = zone.capacity
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

const allowedAnimalTypesForZone = (
  state: GameState,
  player: PlayerState,
  zone: AnimalZone,
  animalKeys: readonly AnimalKey[],
): AnimalKey[] => {
  return animalKeys.filter((animal) => {
    const candidate = createAnimalCounts(state.enableFarmersOfTheMoor === true)
    candidate[animal] = 1
    const normalized = normalizeAnimalCountsForZone(state, player, zone, { animalCounts: candidate })
    return (normalized[animal] ?? 0) > 0
  })
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
  player.houseAnimalCount = houseAnimalType && (houseZone?.animalCount ?? 0) > 0 ? 1 : 0

  const stable: Record<string, AnimalKey | null> = {}
  zones
    .filter((z) => z.zoneType === 'stable')
    .forEach((z) => {
      stable[z.id.replace('stable:', '')] = normalizeAnimalType(z.animalType)
    })
  player.stableAnimals = stable

  const computedZonesById = new Map(computed.map((zone) => [zone.id, zone]))
  const cardZonesById = new Map<string, typeof computed>()
  const keyedCardZoneIds = new Set(
    computed
      .filter((z) => z.zoneType === 'card' && z.cardId)
      .map((zone) => zone.id),
  )
  computed
    .filter((z) => z.zoneType === 'card' && z.cardId)
    .forEach((zone) => {
      const group = cardZonesById.get(zone.cardId!) ?? []
      group.push(zone)
      cardZonesById.set(zone.cardId!, group)
    })
  const cardCountsById = new Map<string, ReturnType<typeof createAnimalCounts>>()
  for (const [cardId, cardZones] of cardZonesById) {
    const existing = player.cardStates?.[cardId]
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
      allowedTypesByZone.set(zone.id, allowedAnimalTypesForZone(state, player, zone, animalKeys))
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
    cardCountsById.set(cardId, assignedCounts)
    if (typeof existing?.counters?.held === 'number') continue
    if (sumAnimalCounts(assignedCounts) <= 0 && !existing?.extraData) continue
    player.cardStates ??= {}
    const nextState = { ...(player.cardStates[cardId] ?? {}) }
    const extraData = { ...((nextState.extraData as Record<string, unknown> | undefined) ?? {}) }
    if (useZoneStorage) {
      writeCountsByZone(
        extraData,
        countsByZone,
        new Map(cardZones.map((zone) => [zone.id, zone])),
        allowedTypesByZone,
      )
    } else writeAnimalHolderCounts(extraData, assignedCounts)
    nextState.extraData = extraData
    player.cardStates[cardId] = nextState
  }
  for (const [cardId, existing] of Object.entries(player.cardStates ?? {})) {
    if (cardZonesById.has(cardId)) continue
    if (typeof existing?.counters?.held === 'number') continue
    const existingExtraData = existing?.extraData as Record<string, unknown> | undefined
    const zoneCounts = existingExtraData?.animalCountsByZone
    const hasZoneCounts = !!zoneCounts && typeof zoneCounts === 'object' && Object.keys(zoneCounts).length > 0
    if (sumAnimalCounts(readAnimalHolderCounts(existing?.extraData)) <= 0 && !hasZoneCounts) continue
    const nextState = { ...existing }
    const extraData = { ...((nextState.extraData as Record<string, unknown> | undefined) ?? {}) }
    writeAnimalHolderCounts(extraData, createAnimalCounts())
    delete extraData.animalCountsByZone
    nextState.extraData = extraData
    player.cardStates![cardId] = nextState
  }

  const totals = createAnimalCounts(state.enableFarmersOfTheMoor === true)
  zones
    .filter((zone) => zone.zoneType !== 'card' || !keyedCardZoneIds.has(zone.id))
    .forEach((zone) => {
      if (zone.zoneType === 'card') {
        const baseZone = computedZonesById.get(zone.id)
        if (baseZone) {
          addAnimalCounts(totals, normalizeAnimalCountsForZone(state, player, baseZone, zone), animalKeys)
          return
        }
      }
      addAnimalCounts(totals, readAnimalCountsForZoneAssignment(zone), animalKeys)
    })
  for (const counts of cardCountsById.values()) addAnimalCounts(totals, counts, animalKeys)
  for (const animal of animalKeys) player.resources[animal] = totals[animal] ?? 0
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
    // NOTE: zones are computed here at emit-time and travel inside `request`.
    // However, GameCore.buildInteraction() in shared/session/session-core.ts still
    // recomputes zones via buildAnimalReorgZones() during the transitional
    // period. Task 6/7 will rewire GameCore to consume zones from the
    // engineStack.peekInteraction()?.request, eliminating the duplicate compute.
    const idx = ctx.state.players.indexOf(ctx.player)
    const zones: InteractionAnimalReorgZone[] = playerBoard(ctx.state, idx).animals.zones().map((zone) => ({
      id: zone.id,
      zoneType: zone.zoneType,
      cardId: zone.cardId,
      animalType: zone.animalType ?? null,
      animalCount: zone.animalCount ?? 0,
      ...(zone.animalCounts ? { animalCounts: zone.animalCounts } : {}),
      ...(zone.allowedAnimalType !== undefined ? { allowedAnimalType: zone.allowedAnimalType } : {}),
      ...(zone.zoneType === 'card' ? { allowedAnimalTypes: allowedAnimalTypesForZone(ctx.state, ctx.player, zone, animalKeysForState(ctx.state)) } : {}),
      ...(zone.farmPosition ? { farmPosition: zone.farmPosition } : {}),
      ...(zone.countsFarmyardSpaceAsUnused !== undefined ? { countsFarmyardSpaceAsUnused: zone.countsFarmyardSpaceAsUnused } : {}),
      ...(zone.displaySource ? { displaySource: zone.displaySource } : {}),
      ...(zone.exclusiveCardZoneLimit !== undefined ? { exclusiveCardZoneLimit: zone.exclusiveCardZoneLimit } : {}),
      capacity: zone.capacity,
    }))
    return {
      type: 'request',
      request: { kind: 'animal-reorg', zones },
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
    const zones = Array.isArray(rawPayload)
      ? rawPayload as ZoneAssignment[]
      : typeof rawPayload === 'object' && rawPayload !== null && Array.isArray((rawPayload as { zones?: unknown }).zones)
        ? (rawPayload as { zones: ZoneAssignment[] }).zones
        : undefined
    if (!zones) return { type: 'fail', errorKey: 'log.reorganizeFail' }
    const before = animalTotals(ctx.state, ctx.player)
    applyReorganizeMutate(ctx.state, ctx.player, zones)
    const after = animalTotals(ctx.state, ctx.player)
    const assigned = positiveAnimals(ctx.state, after)
    if (Object.keys(assigned).length > 0) {
      ctx.eventSink?.emit<'farm.animalMoved'>({
        type: 'farm.animalMoved',
        animals: assigned,
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
