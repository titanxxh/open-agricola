import { Occupation } from '../types'

const CARD_ID = 'B138_ForestGuardian'

export const B138_ForestGuardian = new Occupation({
  id: CARD_ID,
  name: 'Forest Guardian',
  deck: 'B',
  number: 138,
  category: 'GOODS_PROVIDER',
  desc: [
    'When you play this card, you immediately get 2 <WOOD>. Each time before another player takes at least 5 <WOOD> from an accumulation space, they must first pay you 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
})
