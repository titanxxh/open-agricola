import { Occupation } from '../types'

const CARD_ID = 'A148_Woolgrower'

export const A148_Woolgrower = new Occupation({
  id: CARD_ID,
  name: 'Woolgrower',
  deck: 'A',
  number: 148,
  category: 'FARM_PLANNER',
  desc: ['This card can hold a number of <SHEEP> equal to the number of completed feeding phases.'],
  cost: {},
  players: '4+',
})
