import { Occupation } from '../types'

const CARD_ID = 'B131_Equipper'

export const B131_Equipper = new Occupation({
  id: CARD_ID,
  name: 'Equipper',
  deck: 'B',
  number: 131,
  category: 'ACTIONS_BOOSTER',
  desc: ['Immediately after each time you use a wood accumulation space, you can play a minor improvement.'],
  cost: {},
  players: '3+',
  newSet: true,
})
