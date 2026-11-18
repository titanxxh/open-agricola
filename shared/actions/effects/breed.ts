import { buildAnimalReorgRequest } from '../../domain/animal-reorg'
import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
  GameState,
  HarvestBreedSummary,
  PlayerState,
} from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { animalKeysForState, type AnimalKey } from '../../contract/animals'
import {
  computeAnimalZones,
  readAnimalCountsForZoneAssignment,
} from '../../domain/animal-zones'
import {
  getBreedableAnimalCount,
  getBreedOffspringCount,
  getBreedThreshold,
  shouldEnforceReorganizeOnLastHarvest,
} from '../../cards/card-effects'
import type { BreedAnimalType } from '../../cards/card-effects'

export type BreedOptions = {
  animalTypes?: ReadonlyArray<BreedAnimalType>
  sourceCard: string
}

const breedingAnimalCount = (
  state: GameState,
  player: PlayerState,
  animalType: BreedAnimalType,
): number => {
  let count = player.resources[animalType] ?? 0
  for (const animalOwner of state.players ?? []) {
    for (const zone of computeAnimalZones(animalOwner, state)) {
      if (!zone.breedingOwnerPlayerId) continue
      if (zone.breedingOwnerPlayerId === zone.animalOwnerPlayerId) continue
      const amount = readAnimalCountsForZoneAssignment(zone)[animalType] ?? 0
      if (amount <= 0) continue
      if (zone.breedingOwnerPlayerId === player.id) count += amount
      if (zone.animalOwnerPlayerId === player.id) count -= amount
    }
  }
  return Math.max(0, count)
}

type Litter = { type: BreedAnimalType; offspring: number; placementMinimum: number }

/** The litters breeding would produce now, by type; reads state only. */
const breedingLitters = (state: GameState, player: PlayerState, opts: BreedOptions): Litter[] => {
  const litters: Litter[] = []
  for (const type of opts.animalTypes ?? animalKeysForState(state)) {
    const ctx = { sourceCard: opts.sourceCard }
    const breedableCount = getBreedableAnimalCount(state, player, type, breedingAnimalCount(state, player, type), ctx)
    const threshold = getBreedThreshold(state, player, type, ctx)
    if (breedableCount < threshold) continue
    const offspring = getBreedOffspringCount(state, player, type, { ...ctx, breedableCount })
    if (offspring <= 0) continue
    litters.push({
      type,
      offspring,
      placementMinimum: Math.max(0, threshold - (breedableCount - (player.resources[type] ?? 0))) + offspring,
    })
  }
  return litters
}

export const canBreedAnimals = (
  state: GameState,
  player: PlayerState,
  opts: BreedOptions,
): boolean => breedingLitters(state, player, opts).length > 0

/**
 * Core breed helper:
 *   - Every eligible animal type produces its litter: the default one newborn,
 *     adjusted by played-card offspring queries after parent eligibility.
 *     Resources, placement minimums, summaries and events use that count.
 *   - Breeding never checks room. The following animal reorganization decides
 *     which newborns are housed; the player chooses which animals to keep and
 *     unhoused newborns are discarded.
 *
 * Consumed by both harvest path (sourceCard='harvest') and breed-shaped cards
 * such as A165 PigBreeder (sourceCard='A165_PigBreeder').
 */
export const breed = (
  state: GameState,
  player: PlayerState,
  opts: BreedOptions,
  eventSink?: EventSink,
): { breedSummary: HarvestBreedSummary; placementMinimums: Partial<Record<AnimalKey, number>> } => {
  const summary: HarvestBreedSummary = { resources: {}, animalTypes: 0, animalCount: 0 }
  const placementMinimums: Partial<Record<AnimalKey, number>> = {}
  for (const { type, offspring, placementMinimum } of breedingLitters(state, player, opts)) {
    placementMinimums[type] = placementMinimum
    player.resources[type] += offspring
    summary.resources[type] = offspring
    summary.animalTypes += 1
    summary.animalCount += offspring
  }
  if (summary.animalCount > 0) {
    eventSink?.emit<'farm.animalBred'>({
      type: 'farm.animalBred',
      animals: summary.resources,
      source: opts.sourceCard === 'harvest' ? 'harvest' : 'cardEffect',
    })
  }
  return { breedSummary: summary, placementMinimums }
}

type BreedActionContext = {
  animalTypes?: BreedAnimalType[] | null
  sourceCard?: string
}

export const breedAction: ActionDefinition = {
  id: 'breed',
  nameKey: 'actions.breed.name',
  descriptionKey: 'actions.breed.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  /** Shows the newborns each type would produce, so choices between types stay distinguishable. */
  previewEffect: ({ state, player, actionContext }) => {
    const ctx = (actionContext ?? {}) as BreedActionContext
    const litters = breedingLitters(state, player, {
      animalTypes: ctx.animalTypes ?? undefined,
      sourceCard: ctx.sourceCard ?? 'unknown',
    })
    return {
      kind: 'resourceExchange',
      resourcesGained: Object.fromEntries(litters.map(({ type, offspring }) => [type, offspring])),
    }
  },
  execute: ({ state, player, actionContext, eventSink }): ActionExecutionResult => {
    const ctx = (actionContext ?? {}) as BreedActionContext
    const sourceCard = ctx.sourceCard ?? 'unknown'
    const { breedSummary, placementMinimums } = breed(state, player, {
      animalTypes: ctx.animalTypes ?? undefined,
      sourceCard,
    }, eventSink)
    const animalCounts = () =>
      Object.fromEntries(animalKeysForState(state).map((animal) => [animal, player.resources[animal] ?? 0]))
    if (sourceCard === 'harvest') {
      state.harvestBreedSummary ??= {}
      state.harvestBreedSummary[player.id] = breedSummary
      if (breedSummary.animalCount > 0) {
        state.harvestBreedPlacement ??= {}
        state.harvestBreedPlacement[player.id] = { minimums: { ...placementMinimums }, animalCounts: animalCounts() }
      }
    } else if (breedSummary.animalCount > 0) {
      // Settled by the following animal reorganization, which records only housed newborns.
      state.nonHarvestBreedPlacement ??= {}
      state.nonHarvestBreedPlacement[player.id] = {
        newborns: { ...breedSummary.resources },
        minimums: { ...placementMinimums },
        animalCounts: animalCounts(),
      }
    }
    const buildReorgRequest = (): ActionExecutionResult => ({
      type: 'request',
      request: buildAnimalReorgRequest(state, player),
      sourceCard,
    })
    // Animals bred: return 'ok' so this action's immediatelyAfter/after
    // reactions run on the post-breeding state. The session's
    // `getAnimalCount > before` check then starts the reorganize sub-flow.
    if (breedSummary.animalCount > 0) {
      return { type: 'ok', ...(sourceCard === 'harvest' ? { extraData: { harvestBreedPlacementMinimums: placementMinimums } } : {}) }
    }
    // Last harvest without newborns: a played card that declares
    // `enforceReorganizeOnLastHarvest` still requires a final reorganization
    // (no card in this repository declares it yet). The session hands the
    // request to the reorganize sub-flow; this action's completion reactions
    // run once, after the reorganization.
    if (
      sourceCard === 'harvest'
      && state?.round === 14
      && shouldEnforceReorganizeOnLastHarvest(state, player)
    ) {
      return buildReorgRequest()
    }
    return { type: 'ok' }
  },
}

export const breedLeaf = (
  sourceCard: string,
  animalTypes?: ReadonlyArray<BreedAnimalType>,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'breed',
  actionContext: {
    animalTypes: animalTypes ? [...animalTypes] : null,
    sourceCard,
  },
  sourceCard,
})
