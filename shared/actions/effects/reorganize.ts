import type {
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  InteractionAnimalReorgZone,
  PlayerState,
  Resource,
} from '../../contract/types'
import { playerBoard } from '../../domain'
import {
  normalizeAnimalCountsForZone,
  readAnimalCountsForZoneAssignment,
} from '../../domain/animal-zones'
import {
  ANIMAL_KEYS,
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
  animalType: 'sheep' | 'boar' | 'cattle' | null
  animalCount: number
  animalCounts?: Partial<Record<'sheep' | 'boar' | 'cattle', number>>
}

const addAnimalCounts = (
  target: ReturnType<typeof createAnimalCounts>,
  counts: Partial<Record<'sheep' | 'boar' | 'cattle', number>>,
) => {
  for (const key of ANIMAL_KEYS) target[key] += Math.max(0, counts[key] ?? 0)
}

export const applyReorganizeMutate = (
  state: GameState,
  player: PlayerState,
  zones: ZoneAssignment[],
): void => {
  const idx = state.players.indexOf(player)
  const computed = playerBoard(state, idx).animals.zones()
  const cap = (id: string) => computed.find((z) => z.id === id)?.capacity ?? 0

  const pastureZones = zones.filter((z) => z.zoneType === 'pasture')
  player.pastures = player.pastures.map((p) => {
    const a = pastureZones.find((z) => z.id === p.id)
    if (!a || !a.animalType) return { ...p, animalType: null, animalCount: 0 }
    const count = Math.max(0, Math.min(cap(p.id), a.animalCount))
    return { ...p, animalType: count > 0 ? a.animalType : null, animalCount: count }
  })

  const houseZone = zones.find((z) => z.zoneType === 'house')
  player.houseAnimalType = houseZone?.animalType ?? null
  player.houseAnimalCount = houseZone?.animalType && houseZone.animalCount > 0 ? 1 : 0

  const stable: Record<string, 'sheep' | 'boar' | 'cattle' | null> = {}
  zones
    .filter((z) => z.zoneType === 'stable')
    .forEach((z) => {
      stable[z.id.replace('stable:', '')] = z.animalType ?? null
    })
  player.stableAnimals = stable

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
    const zoneIds = new Set(cardZones.map((zone) => zone.id))
    const assignedCounts = createAnimalCounts()
    zones
      .filter((z) => z.zoneType === 'card' && zoneIds.has(z.id))
      .forEach((assigned) => {
        addAnimalCounts(assignedCounts, readAnimalCountsForZoneAssignment(assigned))
      })
    if (typeof existing?.counters?.held === 'number') {
      cardCountsById.set(cardId, assignedCounts)
      continue
    }
    const baseZone = {
      ...cardZones[0]!,
      capacity: Math.max(...cardZones.map((zone) => cap(zone.id)), 0),
    }
    const counts = normalizeAnimalCountsForZone(state, player, baseZone, {
      animalCounts: assignedCounts,
    })
    cardCountsById.set(cardId, counts)
    if (sumAnimalCounts(counts) <= 0 && !existing?.extraData) continue
    player.cardStates ??= {}
    const nextState = { ...(player.cardStates[cardId] ?? {}) }
    const extraData = { ...((nextState.extraData as Record<string, unknown> | undefined) ?? {}) }
    writeAnimalHolderCounts(extraData, counts)
    nextState.extraData = extraData
    player.cardStates[cardId] = nextState
  }
  for (const [cardId, existing] of Object.entries(player.cardStates ?? {})) {
    if (cardZonesById.has(cardId)) continue
    if (typeof existing?.counters?.held === 'number') continue
    if (sumAnimalCounts(readAnimalHolderCounts(existing?.extraData)) <= 0) continue
    const nextState = { ...existing }
    const extraData = { ...((nextState.extraData as Record<string, unknown> | undefined) ?? {}) }
    writeAnimalHolderCounts(extraData, createAnimalCounts())
    nextState.extraData = extraData
    player.cardStates![cardId] = nextState
  }

  const totals = createAnimalCounts()
  zones
    .filter((zone) => zone.zoneType !== 'card' || !keyedCardZoneIds.has(zone.id))
    .forEach((zone) => addAnimalCounts(totals, readAnimalCountsForZoneAssignment(zone)))
  for (const counts of cardCountsById.values()) addAnimalCounts(totals, counts)
  player.resources.sheep = totals.sheep
  player.resources.boar = totals.boar
  player.resources.cattle = totals.cattle
}

const ANIMAL_TYPES = ['sheep', 'boar', 'cattle'] as const

const animalTotals = (player: PlayerState): Pick<Resource, (typeof ANIMAL_TYPES)[number]> => ({
  sheep: player.resources.sheep ?? 0,
  boar: player.resources.boar ?? 0,
  cattle: player.resources.cattle ?? 0,
})

const discardedAnimals = (
  before: Pick<Resource, (typeof ANIMAL_TYPES)[number]>,
  after: Pick<Resource, (typeof ANIMAL_TYPES)[number]>,
): Partial<Resource> => {
  const discarded: Partial<Resource> = {}
  for (const type of ANIMAL_TYPES) {
    const amount = before[type] - after[type]
    if (amount > 0) discarded[type] = amount
  }
  return discarded
}

const positiveAnimals = (
  animals: Pick<Resource, (typeof ANIMAL_TYPES)[number]>,
): Partial<Pick<Resource, (typeof ANIMAL_TYPES)[number]>> => {
  const result: Partial<Pick<Resource, (typeof ANIMAL_TYPES)[number]>> = {}
  for (const type of ANIMAL_TYPES) {
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
      animalType: (zone.animalType as 'sheep' | 'boar' | 'cattle' | null) ?? null,
      animalCount: zone.animalCount ?? 0,
      ...(zone.animalCounts ? { animalCounts: zone.animalCounts } : {}),
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
    const before = animalTotals(ctx.player)
    applyReorganizeMutate(ctx.state, ctx.player, zones)
    const after = animalTotals(ctx.player)
    const assigned = positiveAnimals(after)
    if (Object.keys(assigned).length > 0) {
      ctx.eventSink?.emit<'farm.animalMoved'>({
        type: 'farm.animalMoved',
        animals: assigned,
      })
    }
    const discarded = discardedAnimals(before, after)
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
