import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
  GameState,
  HarvestBreedSummary,
  PlayerState,
} from '../../contract/types'
import { playerBoard, getTotalAnimalCapacity } from '../../domain'
import { shouldEnforceReorganizeOnLastHarvest } from '../../cards/card-effects'

export type BreedAnimalType = 'sheep' | 'boar' | 'cattle'

export type BreedOptions = {
  animalTypes?: ReadonlyArray<BreedAnimalType>
  sourceCard: string
}

const DEFAULT_TYPES: ReadonlyArray<BreedAnimalType> = ['sheep', 'boar', 'cattle']

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
  _state: GameState | null,
  player: PlayerState,
  opts: BreedOptions,
): { breedSummary: HarvestBreedSummary } => {
  const types = opts.animalTypes ?? DEFAULT_TYPES
  let freeCapacity = getTotalAnimalCapacity(player)
  const summary: HarvestBreedSummary = { resources: {}, animalTypes: 0, animalCount: 0 }
  for (const type of types) {
    if (freeCapacity <= 0) break
    if (player.resources[type] < 2) continue
    player.resources[type] += 1
    summary.resources[type] = 1
    summary.animalTypes += 1
    summary.animalCount += 1
    freeCapacity -= 1
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
  execute: ({ state, player, actionContext }): ActionExecutionResult => {
    const ctx = (actionContext ?? {}) as BreedActionContext
    const sourceCard = ctx.sourceCard ?? 'unknown'
    const { breedSummary } = breed(state, player, {
      animalTypes: ctx.animalTypes ?? undefined,
      sourceCard,
    })
    if (sourceCard === 'harvest') {
      state.harvestBreedSummary ??= {}
      state.harvestBreedSummary[player.id] = breedSummary
      // Match legacy applyBreedPhase log entry. Skip when no resources bred.
      if (breedSummary.animalCount > 0) {
        state.log.unshift({
          key: 'log.harvestBreedDetail',
          params: { player: player.name, resources: breedSummary.resources },
        })
      }
    }
    const buildReorgRequest = (): ActionExecutionResult => {
      const idx = state.players.indexOf(player)
      const zones = playerBoard(state, idx).animals.zones().map((zone) => ({
        id: zone.id,
        zoneType: zone.zoneType as 'pasture' | 'house' | 'stable',
        animalType: (zone.animalType as 'sheep' | 'boar' | 'cattle' | null) ?? null,
        animalCount: zone.animalCount ?? 0,
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
