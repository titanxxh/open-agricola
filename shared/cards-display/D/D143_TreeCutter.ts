import { Occupation } from '../types'

const CARD_ID = 'D143_TreeCutter'

export const D143_TreeCutter = new Occupation({
  id: CARD_ID,
  name: 'Tree Cutter',
  deck: 'D',
  number: 143,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you use an accumulation space providing at least 3 goods of the same type except <WOOD>, you get an additional 1 <WOOD>. (<FOOD> is also considered a good.)',
  ],
  cost: {},
  players: '3+',
  newSet: true,
  implemented: true,
})
