import { Occupation } from '../types'

const CARD_ID = 'D87_MasterBuilder'

export const D87_MasterBuilder = new Occupation({
  id: CARD_ID,
  name: 'Master Builder',
  deck: 'D',
  number: 87,
  category: 'FARM_PLANNER',
  desc: ['Once your house has at least 5 rooms, at any time, but only once this game, you can add another room at no cost.'],
  cost: {},
  players: '1+',
  implemented: true,
})
