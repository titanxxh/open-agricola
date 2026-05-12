import { Occupation } from '../types'

const CARD_ID = 'A146_StorehouseSteward'

export const A146_StorehouseSteward = new Occupation({
  id: CARD_ID,
  name: 'Storehouse Steward',
  deck: 'A',
  number: 146,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you take exactly 2/3/4/5 <FOOD> from a food accumulation space, you also get 1 <STONE>/<REED>/<CLAY>/<WOOD>. (If you take 6 or more <FOOD>, you do not get a bonus good).'],
  cost: {},
  players: '3+',
})
