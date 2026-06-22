import type { ActionDefinition } from '../../contract/types'

export const animalMarketCattleAction: ActionDefinition = {
  id: 'animal-market-cattle-56',
  nameKey: 'actions.animal-market-56.option-cattle',
  descriptionKey: 'actions.animal-market-56.option-cattle',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => (player.resources.food ?? 0) >= 1,
  execute: ({ sourceCard }) => ({
    type: 'flow',
    flow: {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard },
        { type: 'leaf', actionId: 'gain', params: { cattle: 1 }, sourceCard },
      ],
    },
  }),
}
