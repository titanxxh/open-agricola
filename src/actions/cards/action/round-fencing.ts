import type { ActionDefinition } from '../../../game/types'

export const fencing: ActionDefinition = {
  id: 'fencing',
  nameKey: 'actions.fencing.name',
  descriptionKey: 'actions.fencing.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => player.resources.wood > 0,
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'fence' }],
  },
}
