import { Occupation } from '../types'

const CARD_ID = 'B130_FullPeasant'

export const B130_FullPeasant = new Occupation({
  id: CARD_ID,
  name: 'Full Peasant',
  deck: 'B',
  number: 130,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after you use the __Grain Utilization__ or __Fencing__ action space while the other is unoccupied, you can pay 1 <FOOD> to use the other space with the same person.',
  ],
  cost: {},
  players: '3+',
})
