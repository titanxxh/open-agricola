import { Occupation } from '../types'

const CARD_ID = 'B128_Plumber'

export const B128_Plumber = new Occupation({
  id: CARD_ID,
  name: 'Plumber',
  deck: 'B',
  number: 128,
  category: 'FARM_PLANNER',
  desc: [
    'Each time after you use the __Major Improvement__ action space, you can take a __Renovation__ action, paying 2 <CLAY> or 2 <STONE> less for the renovation.',
  ],
  cost: {},
  players: '3+',
})
