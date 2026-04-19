import { gainResources } from '../../actions/effects/gain'
import type { ActionDefinition } from '../../game/types'

export const resourceMarket: ActionDefinition = {
  id: 'resource-market',
  nameKey: 'actions.resource-market.name',
  descriptionKey: 'actions.resource-market.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [3],
  canBeExecutedByPlayer: () => true,
  execute: () => ({
    type: 'choice',
    promptKey: 'actions.resource-market.description',
    options: [
      { value: 'reed-food', labelKey: 'actions.resource-market.option-reed' },
      { value: 'stone-food', labelKey: 'actions.resource-market.option-stone' },
    ],
  }),
  resolveChoice: ({ player }, choice) => {
    if (choice === 'reed-food') {
      gainResources(player, { reed: 1, food: 1 })
    } else {
      gainResources(player, { stone: 1, food: 1 })
    }
    return { type: 'ok' }
  },
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'gain' }],
  },
}
