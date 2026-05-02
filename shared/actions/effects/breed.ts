import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
  GameState,
  HarvestBreedSummary,
  PlayerState,
} from '../../game/types'
import { getTotalAnimalCapacity } from '../helpers/animal-zones'

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
    if (breedSummary.animalCount > 0) {
      return { type: 'animalReorg', sourceId: `card:${sourceCard}` }
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
