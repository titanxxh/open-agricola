import { Occupation } from '../types'

const CARD_ID = 'D125_ForestTrader'

export const D125_ForestTrader = new Occupation({
  id: CARD_ID,
  name: 'Forest Trader',
  deck: 'D',
  number: 125,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use a wood or clay accumulation space, you can also buy exactly 1 building resource. <WOOD>, <CLAY>, and <REED> cost 1 <FOOD> each; <STONE> costs 2 food.'],
  cost: {},
  players: '1+',
})
