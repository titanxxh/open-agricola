import type { ActionDefinition } from '../contract/types'

const COST = { wood: 1 }
const REWARD = { fuel: 1 }

export const moorWoodToFuelAction: ActionDefinition = {
  id: 'moor-wood-to-fuel',
  nameKey: 'actions.moor-wood-to-fuel.name',
  descriptionKey: 'actions.moor-wood-to-fuel.description',
  roundAvailable: 1,
  gainPerRound: {},
  anytime: true,
  previewEffect: () => ({ kind: 'resourceExchange', resourcesPaid: COST, resourcesGained: REWARD }),
  canBeExecutedByPlayer: (state, player) =>
    state.enableFarmersOfTheMoor === true && player.resources.wood > 0,
  execute: ({ player }) => {
    if (player.resources.wood <= 0) return { type: 'fail', errorKey: 'actions.moor-wood-to-fuel.description' }
    player.resources.wood -= COST.wood
    player.resources.fuel = (player.resources.fuel ?? 0) + REWARD.fuel
    return { type: 'ok' }
  },
}
