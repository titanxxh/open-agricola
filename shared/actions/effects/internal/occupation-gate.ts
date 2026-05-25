import type { ActionDefinition } from '../../../contract/types'
import { hasPlayableOccupationChoice } from '../occupation'

const readOccupationParams = (
  actionContext?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const params = actionContext?.occupationParams
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined
  return params as Record<string, unknown>
}

export const occupationGateAction: ActionDefinition = {
  id: 'occupation-gate',
  nameKey: 'actions.lessons.name',
  descriptionKey: 'actions.lessons.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) =>
    hasPlayableOccupationChoice(
      state,
      player,
      'occupation',
      readOccupationParams(context?.actionContext),
    ),
  execute: () => ({ type: 'ok' }),
}
