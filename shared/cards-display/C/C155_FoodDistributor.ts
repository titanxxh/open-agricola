import { Occupation } from '../types'

const CARD_ID = 'C155_FoodDistributor'

export const C155_FoodDistributor = new Occupation({
  id: CARD_ID,
  name: 'Food Distributor',
  deck: 'C',
  number: 155,
  category: 'GOODS_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <GRAIN> and, at the start of this returning home phase, an amount of <FOOD> equal to the number of occupied Round 1-14 action spaces.',
  ],
  cost: {},
  players: '4+',
})
