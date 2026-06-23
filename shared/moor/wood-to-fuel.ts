import type { ActionDefinition } from '../contract/types'

export const moorWoodToFuelAction: ActionDefinition = {
  id: 'moor-wood-to-fuel',
  nameKey: 'actions.moor-wood-to-fuel.name',
  descriptionKey: 'actions.moor-wood-to-fuel.description',
  roundAvailable: 1,
  gainPerRound: {},
  anytime: true,
  canBeExecutedByPlayer: (state, player) =>
    state.enableFarmersOfTheMoor === true && player.resources.wood > 0,
  execute: ({ player }) => {
    if (player.resources.wood <= 0) return { type: 'fail', errorKey: 'actions.moor-wood-to-fuel.description' }
    player.resources.wood -= 1
    player.resources.fuel = (player.resources.fuel ?? 0) + 1
    return { type: 'ok' }
  },
}
