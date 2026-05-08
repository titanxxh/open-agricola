import { Occupation } from '../types'

const CARD_ID = 'D140_Loudmouth'

export const D140_Loudmouth = new Occupation({
  id: CARD_ID,
  name: 'Loudmouth',
  deck: 'D',
  number: 140,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you take at least 4 building resources or 4 animals from an accumulation space, you also get 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})
