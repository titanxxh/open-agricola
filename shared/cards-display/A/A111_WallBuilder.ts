import { Occupation } from '../types'

const CARD_ID = 'A111_WallBuilder'

export const A111_WallBuilder = new Occupation({
  id: CARD_ID,
  name: 'Wall Builder',
  deck: 'A',
  number: 111,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you build at least 1 room, you can place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
