import { Occupation } from '../types'

const CARD_ID = 'B87_Cottager'

export const B87_Cottager = new Occupation({
  id: CARD_ID,
  name: 'Cottager',
  deck: 'B',
  number: 87,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Day Laborer__ action space, you can also either build exactly 1 room or renovate your house. Either way, you have to pay the cost.'],
  cost: {},
  players: '1+',
})
