import { Occupation } from '../types'

const CARD_ID = 'C93_InnerDistrictsDirector'

export const C93_InnerDistrictsDirector = new Occupation({
  id: CARD_ID,
  name: 'Inner Districts Director',
  deck: 'C',
  number: 93,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time you use the __Forest__ or __Clay Pit__ accumulation space, you can place 1 <STONE> from the general supply on the other space. If you do, you can immediately place another person.',
  ],
  cost: {},
  players: '1+',
})
