import { Occupation } from '../types'

const CARD_ID = 'C102_TreeGuard'

export const C102_TreeGuard = new Occupation({
  id: CARD_ID,
  name: 'Tree Guard',
  deck: 'C',
  number: 102,
  category: 'GOODS_PROVIDER',
  desc: [
    'Each time after you use a wood accumulation space, you can place 4 <WOOD> from your supply on that space to get 2 <STONE>, 1 <CLAY>, 1 <REED>, and 1 <GRAIN>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
