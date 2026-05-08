import { Occupation } from '../types'

const CARD_ID = 'B93_Confidant'

export const B93_Confidant = new Occupation({
  id: CARD_ID,
  name: 'Confidant',
  deck: 'B',
  number: 93,
  category: 'ACTIONS_BOOSTER',
  desc: ['Place 1 <FOOD> from your supply on each of the next 2, 3, or 4 round spaces. At the start of these rounds, you get the <FOOD> back and your choice of a __Sow__ or __Build Fences__ action.'],
  cost: {},
  players: '1+',
})
