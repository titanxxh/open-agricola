import { Occupation } from '../types'

const CARD_ID = 'B155_ArtTeacher'

export const B155_ArtTeacher = new Occupation({
  id: CARD_ID,
  name: 'Art Teacher',
  deck: 'B',
  number: 155,
  category: 'GOODS_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD> and 1 <REED>. Each time you pay an occupation cost, you can use <FOOD> from the __Traveling Players__ accumulation space.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
