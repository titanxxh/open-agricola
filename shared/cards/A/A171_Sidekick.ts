import { Occupation } from '../../cards-display/types'

export const A171_Sidekick = new Occupation({
  id: 'A171_Sidekick',
  name: 'Sidekick',
  deck: 'A',
  number: 171,
  category: 'ACTIONS_BOOSTER',
  desc: ['Immediately after each time you place a person on an action space card, you can pay 1 food to place another person on the card immediately left to it (and so on).'],
  cost: {},
  players: '5+',
})
