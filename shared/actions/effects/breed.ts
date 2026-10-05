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
    // Animals bred: return 'ok' so the engine's after/immediatelyAfter hooks
    // still run on the post-mutate state (D60 LargePottery, B104 SheepWalker,
    // ...). GameCore's `getAnimalCount > before` heuristic then auto-launches
    // the reorganize sub-flow — this preserves the legacy `'animalReorg'`
    // behaviour without short-circuiting the engine's hook pipeline.
    if (breedSummary.animalCount > 0) {
      return { type: 'ok', ...(sourceCard === 'harvest' ? { extraData: { harvestBreedPlacementMinimums: placementMinimums } } : {}) }
    }
    // Rule: in round 14 (last harvest), some cards (B104 SheepWalker, B35
    // HookKnife, A153 PigOwner, ...) force a reorg even with no newborn so the
    // engine has a chance to evict mis-placed animals. Edge-case path —
    // returning 'request' here skips the `after` hooks, but round 14 is the
    // terminal harvest where no further leaf-level after listeners fire.
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
