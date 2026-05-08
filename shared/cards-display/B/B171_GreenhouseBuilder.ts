import { Occupation } from '../types'

export const B171_GreenhouseBuilder = new Occupation({
  id: 'B171_GreenhouseBuilder',
  name: 'Greenhouse Builder',
  deck: 'B',
  number: 171,
  category: 'ACTIONS_BOOSTER',
  desc: ['This is an action space for you only. It provides a choice of "Fencing", "House Redevelopment", or "Vegetable Seeds" if the corresponding action space is already in play.'],
  cost: {},
  players: '5+',
})
