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
import { getTotalAnimalCapacity } from '../../domain'
import {
  computeAnimalZones,
  readAnimalCountsForZoneAssignment,
} from '../../domain/animal-zones'
import { getBreedableAnimalCount, getBreedThreshold, shouldEnforceReorganizeOnLastHarvest } from '../../cards/card-effects'
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

export const canBreedAnimals = (
  state: GameState,
  player: PlayerState,
  opts: BreedOptions,
): boolean => {
  const types = opts.animalTypes ?? animalKeysForState(state)
  const freeCapacity = getTotalAnimalCapacity(player, state)
  for (const type of types) {
    if (freeCapacity <= 0) return false
    const ctx = { sourceCard: opts.sourceCard }
    const breedableCount = getBreedableAnimalCount(state, player, type, breedingAnimalCount(state, player, type), ctx)
    if (breedableCount < getBreedThreshold(state, player, type, ctx)) continue
    return true
  }
  return false
}

/**
 * Core breed helper — replays the legacy `breedAnimals` semantics:
 *   - free capacity = `getTotalAnimalCapacity(player)` (no subtraction of
 *     assigned, matching prior harvest behaviour). Each newborn consumes one
 *     unit of free capacity.
 *   - For each requested animal type with ≥2 of that resource, +1 and record
 *     the increment in the returned summary.
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
  const types = opts.animalTypes ?? animalKeysForState(state)
  let freeCapacity = getTotalAnimalCapacity(player, state)
  const summary: HarvestBreedSummary = { resources: {}, animalTypes: 0, animalCount: 0 }
  const placementMinimums: Partial<Record<AnimalKey, number>> = {}
  for (const type of types) {
    if (freeCapacity <= 0) break
    const ctx = { sourceCard: opts.sourceCard }
    const breedableCount = getBreedableAnimalCount(state, player, type, breedingAnimalCount(state, player, type), ctx)
    const threshold = getBreedThreshold(state, player, type, ctx)
    if (breedableCount < threshold) continue
    placementMinimums[type] = Math.max(0, threshold - (breedableCount - (player.resources[type] ?? 0))) + 1
    player.resources[type] += 1
    summary.resources[type] = 1
    summary.animalTypes += 1
    summary.animalCount += 1
    freeCapacity -= 1
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
  execute: ({ state, player, actionContext, eventSink }): ActionExecutionResult => {
    const ctx = (actionContext ?? {}) as BreedActionContext
    const sourceCard = ctx.sourceCard ?? 'unknown'
    const { breedSummary, placementMinimums } = breed(state, player, {
      animalTypes: ctx.animalTypes ?? undefined,
      sourceCard,
    }, eventSink)
    if (sourceCard === 'harvest') {
      state.harvestBreedSummary ??= {}
      state.harvestBreedSummary[player.id] = breedSummary
      if (breedSummary.animalCount > 0) {
        state.harvestBreedPlacement ??= {}
        state.harvestBreedPlacement[player.id] = {
          minimums: { ...placementMinimums },
          animalCounts: Object.fromEntries(animalKeysForState(state).map((animal) => [animal, player.resources[animal] ?? 0])),
        }
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
