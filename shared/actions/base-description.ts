import type { ActionSpace, ChoiceDescriptionPreview, GameState } from '../contract/types'
import { Engine, ActionRegistry } from '../engine'
import { getAllAdHocActions } from './helpers/ad-hoc-action-registry'
import { createInternalActionDefinitions } from './internal-actions'
import { getMoorWorkerPlacementPolicy } from '../moor/worker-placement'

/** Base-board rules never acquire the viewed farm's discounts or admission state. */
export const createBaseActionDescriber = (state: GameState): ((space: ActionSpace) => ChoiceDescriptionPreview | undefined) => {
  const original = state.players[0]
  if (!original) return () => undefined
  const baseState = { ...state, players: state.players.map(candidate => ({ ...candidate, activeModifiers: [], minorPlayed: [], occupationPlayed: [], improvements: [], cardStates: {} })) }
  const player = baseState.players[0]!
  const registry = new ActionRegistry()
  for (const action of [...state.actionSpaces, ...createInternalActionDefinitions(actionId => registry.get(actionId)), ...getAllAdHocActions()]) registry.register(action)
  return space => {
    const description = Engine.describeFlow({ type: 'leaf', actionId: space.id, expandFlow: true }, registry,
      { actionHooks: undefined, state: baseState, player, space, previewMode: 'base' })
    return description && state.enableFarmersOfTheMoor && getMoorWorkerPlacementPolicy(space.id) === 'sick-preferred'
      ? { ...description, workerPlacement: 'sick-preferred' } : description
  }
}
