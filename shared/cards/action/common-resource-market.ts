import type { ActionDefinition } from '../../contract/types'

export const resourceMarket: ActionDefinition = {
  id: 'resource-market',
  nameKey: 'actions.resource-market.name',
  descriptionKey: 'actions.resource-market.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [3],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'xor',
    promptKey: 'actions.resource-market.description',
    children: [
      { type: 'leaf', actionId: 'gain', params: { reed: 1, food: 1 }, choiceLabelKey: 'actions.resource-market.option-reed' },
      { type: 'leaf', actionId: 'gain', params: { stone: 1, food: 1 }, choiceLabelKey: 'actions.resource-market.option-stone' },
    ],
  },
}
