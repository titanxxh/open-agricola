import { Occupation } from '../types'

const CARD_ID = 'B108_OvenFiringBoy'

export const B108_OvenFiringBoy = new Occupation({
  id: CARD_ID,
  name: 'Oven Firing Boy',
  deck: 'B',
  number: 108,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you use a wood accumulation space, you get an additional __Bake Bread__ action.',
  ],
  cost: {},
  players: '1+',
})
