import { Occupation } from '../types'

const CARD_ID = 'C130_OutskirtsDirector'

export const C130_OutskirtsDirector = new Occupation({
  id: CARD_ID,
  name: 'Outskirts Director',
  deck: 'C',
  number: 130,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time you use the __Grove__ or __Hollow__ accumulation space, you can place 2 <REED> from the general supply on the other space. If you do, you can immediately place another person.',
  ],
  cost: {},
  players: '3+',
})
