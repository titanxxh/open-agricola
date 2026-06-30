import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
  GameState,
  HarvestBreedSummary,
  InteractionAnimalReorgZone,
  PlayerState,
} from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { animalKeysForState } from '../../contract/animals'
import { playerBoard, getTotalAnimalCapacity } from '../../domain'
import { getAllowedAnimalTypesForZone } from '../../domain/animal-zones'
import { getBreedableAnimalCount, getBreedThreshold, shouldEnforceReorganizeOnLastHarvest } from '../../cards/card-effects'
import type { BreedAnimalType } from '../../cards/card-effects'

export type BreedOptions = {
  animalTypes?: ReadonlyArray<BreedAnimalType>
  sourceCard: string
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
    const breedableCount = getBreedableAnimalCount(state, player, type, player.resources[type] ?? 0, ctx)
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
): { breedSummary: HarvestBreedSummary } => {
  const types = opts.animalTypes ?? animalKeysForState(state)
  let freeCapacity = getTotalAnimalCapacity(player, state)
  const summary: HarvestBreedSummary = { resources: {}, animalTypes: 0, animalCount: 0 }
  for (const type of types) {
    if (freeCapacity <= 0) break
    const ctx = { sourceCard: opts.sourceCard }
    const breedableCount = getBreedableAnimalCount(state, player, type, player.resources[type] ?? 0, ctx)
    if (breedableCount < getBreedThreshold(state, player, type, ctx)) continue
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
  return { breedSummary: summary }
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
    const { breedSummary } = breed(state, player, {
      animalTypes: ctx.animalTypes ?? undefined,
      sourceCard,
    }, eventSink)
    if (sourceCard === 'harvest') {
      state.harvestBreedSummary ??= {}
      state.harvestBreedSummary[player.id] = breedSummary
    }
    const buildReorgRequest = (): ActionExecutionResult => {
      const idx = state.players.indexOf(player)
      const zones: InteractionAnimalReorgZone[] = playerBoard(state, idx).animals.zones().map((zone) => ({
        id: zone.id,
        zoneType: zone.zoneType,
        cardId: zone.cardId,
        animalType: zone.animalType ?? null,
        animalCount: zone.animalCount ?? 0,
        ...(zone.animalCounts ? { animalCounts: zone.animalCounts } : {}),
        ...(zone.allowedAnimalType !== undefined ? { allowedAnimalType: zone.allowedAnimalType } : {}),
        ...(zone.zoneType === 'card' ? { allowedAnimalTypes: getAllowedAnimalTypesForZone(state, player, zone) } : {}),
        ...(zone.farmPosition ? { farmPosition: zone.farmPosition } : {}),
        ...(zone.countsFarmyardSpaceAsUnused !== undefined ? { countsFarmyardSpaceAsUnused: zone.countsFarmyardSpaceAsUnused } : {}),
        ...(zone.displaySource ? { displaySource: zone.displaySource } : {}),
        ...(zone.exclusiveCardZoneLimit !== undefined ? { exclusiveCardZoneLimit: zone.exclusiveCardZoneLimit } : {}),
        capacity: zone.capacity,
      }))
      return {
        type: 'request',
        request: { kind: 'animal-reorg', zones },
        sourceCard,
      }
    }
    // Animals bred: return 'ok' so the engine's after/immediatelyAfter hooks
    // still run on the post-mutate state (D60 LargePottery, B104 SheepWalker,
    // ...). GameCore's `getAnimalCount > before` heuristic then auto-launches
    // the reorganize sub-flow — this preserves the legacy `'animalReorg'`
    // behaviour without short-circuiting the engine's hook pipeline.
    if (breedSummary.animalCount > 0) {
      return { type: 'ok' }
    }
    // BGA: in round 14 (last harvest), some cards (B104 SheepWalker, B35
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
