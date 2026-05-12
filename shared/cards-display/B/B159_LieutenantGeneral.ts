import { Occupation } from '../types'

const CARD_ID = 'B159_LieutenantGeneral'

export const B159_LieutenantGeneral = new Occupation({
  id: CARD_ID,
  name: 'Lieutenant General',
  deck: 'B',
  number: 159,
  category: 'FOOD_PROVIDER',
  desc: [
    'For each field tile that another player places next to an existing field tile, you get 1 <FOOD> from the general supply. In round 14, you get 1 <GRAIN> instead.',
  ],
  cost: {},
  players: '4+',
})
