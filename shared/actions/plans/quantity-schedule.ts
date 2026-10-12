import type { ActionDefinition, ActionExecutionResult, ActionFlow, ChoiceEffectPreview, GameState, PlayerState, Resource, FutureMeepleRequest, InteractionRequest } from '../../contract/types'
import { REAL_RESOURCE_KEYS } from '../../contract/resource-keys'
import { getAssignedAnimalsByType, subtractAnimalsFromBoard } from '../../domain/animals'
import { futureMeeplesNode } from '../effects/internal/future-meeples'

export type QuantitySchedule = readonly { resource: 'sheep' | 'boar' | 'cattle'; rounds: number; resourcesPerUnit: Partial<Resource> }[]
export const describeQuantitySchedule = (state: GameState, player: PlayerState, plan: QuantitySchedule, preset?: Partial<Resource>): ChoiceEffectPreview => {
  const assigned = getAssignedAnimalsByType(player, state)
  return { kind: 'resourceQuantitySchedule', ...(preset ? { preset } : {}), choices: plan.map(choice => ({ resource: choice.resource,
    available: assigned[choice.resource], resourcesPerUnit: choice.resourcesPerUnit,
    rounds: Array.from({ length: choice.rounds }, (_, index) => state.round + index + 1).filter(round => round <= 14),
  })) }
}
export const executeQuantitySchedule = (state: GameState, player: PlayerState, sourceCard: string, plan: QuantitySchedule, counts: Partial<Resource>, sourceSummary?: NonNullable<FutureMeepleRequest['sourceSummary']>): ActionFlow => {
  subtractAnimalsFromBoard(player, counts, state)
  let summaryAttached = false
  const children: ActionFlow[] = plan.flatMap((choice) => {
    const count = counts[choice.resource] ?? 0
    if (count <= 0) return []
    const resources: Partial<Resource> = {}
    for (const key of REAL_RESOURCE_KEYS) {
      const amount = choice.resourcesPerUnit[key]
      if (amount) resources[key] = amount * count
    }
    const attachSummary = !summaryAttached
    summaryAttached = true
    return [futureMeeplesNode({ cardId: sourceCard, playerId: player.id, startRound: state.round + 1,
      count: choice.rounds, resources, ...(attachSummary && sourceSummary ? { sourceSummary } : {}) })]
  })
  return children.length === 1 ? children[0]! : { type: 'seq', children }
}

export const createAnimalScheduleSelectionAction = (id: string, sourceCard: string, plan: QuantitySchedule, promptKey: NonNullable<Extract<InteractionRequest, { kind: 'resource-quantity-select' }>['promptKey']>, summaryKey: NonNullable<FutureMeepleRequest['sourceSummary']>['key']): ActionDefinition => {
  const animals = ['sheep', 'boar', 'cattle'] as const
  const readCounts = (raw: unknown): Partial<Resource> | undefined => {
    if (!raw || typeof raw !== 'object') return
    const counts: Partial<Resource> = {}
    for (const animal of animals) {
      const amount = Reflect.get(raw, animal) ?? 0
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) return
      counts[animal] = amount
    }
    return counts
  }
  const resolve = (state: GameState, player: PlayerState, raw: unknown): ActionExecutionResult => {
    const counts = readCounts(raw)
    if (!counts || animals.reduce((sum, animal) => sum + (counts[animal] ?? 0), 0) < 1) return { type: 'fail', errorKey: 'salter-pick.error.must-pick-at-least-one' }
    const assigned = getAssignedAnimalsByType(player, state)
    for (const animal of animals) if ((counts[animal] ?? 0) > assigned[animal]) return { type: 'fail', errorKey: `salter-pick.error.invalid-count-${animal}` }
    const schedules = plan.flatMap(choice => {
      const count = counts[choice.resource] ?? 0
      const start = state.round + 1, end = Math.min(14, state.round + choice.rounds)
      return count > 0 && start <= end ? [{ count, start, end, food: choice.resourcesPerUnit.food ?? 0 }] : []
    })
    const summary = { key: summaryKey, params: {
      cardId: sourceCard, animals: animals.filter(animal => (counts[animal] ?? 0) > 0).map(animal => `${counts[animal]} ${animal}`).join(', '),
      sheep: counts.sheep ?? 0, boar: counts.boar ?? 0, cattle: counts.cattle ?? 0,
      futureFood: schedules.reduce((sum, entry) => sum + entry.count * entry.food * (entry.end - entry.start + 1), 0),
      schedule: schedules.map(entry => `${entry.count * entry.food} food in rounds ${entry.start}-${entry.end}`).join('; '),
    } }
    return { type: 'flow', flow: executeQuantitySchedule(state, player, sourceCard, plan, counts, summary) }
  }
  return {
    id, nameKey: 'actions.salter-pick.name', descriptionKey: 'actions.salter-pick.description', roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
    previewEffect: ({ state, player, params }) => describeQuantitySchedule(state, player, plan, params?.presetCounts ? readCounts(params.presetCounts) : undefined),
    execute: ({ state, player, params }) => {
      if (params?.presetCounts) return resolve(state, player, params.presetCounts)
      const assigned = getAssignedAnimalsByType(player, state)
      if (animals.reduce((sum, animal) => sum + assigned[animal], 0) <= 0) return { type: 'fail', errorKey: 'salter-pick.error.no-animals-on-board' }
      return { type: 'request', request: { kind: 'resource-quantity-select', cardId: sourceCard,
        availableByResource: { sheep: assigned.sheep, boar: assigned.boar, cattle: assigned.cattle }, promptKey, requireAtLeastOne: true } }
    },
    resolveChoice: ({ state, player }, _choice, payload) => resolve(state, player, payload?.resourceCounts ?? payload),
  }
}
