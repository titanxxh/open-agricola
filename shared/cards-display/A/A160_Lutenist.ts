import { Occupation } from '../types'

const CARD_ID = 'A160_Lutenist'

export const A160_Lutenist = new Occupation({
  id: CARD_ID,
  name: 'Lutenist',
  deck: 'A',
  number: 160,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time another player uses the __Traveling Players__ accumulation space, you get 1 <FOOD> and 1 <WOOD>. Immediately after, you can buy exactly 1 <VEGETABLE> for 2 <FOOD>.',
  ],
  cost: {},
  players: '4+',
})
