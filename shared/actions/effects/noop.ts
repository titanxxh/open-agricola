import type { ActionDefinition } from '../../game/types'

export const noopAction: ActionDefinition = {
  id: 'noop',
  nameKey: 'actions.noop.name',
  descriptionKey: 'actions.noop.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
}
