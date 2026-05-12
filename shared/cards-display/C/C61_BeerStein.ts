import { MinorImprovement } from '../types'

const CARD_ID = 'C61_BeerStein'

export const C61_BeerStein = new MinorImprovement({
  id: CARD_ID,
  name: 'Beer Stein',
  deck: 'C',
  number: 61,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you take a __Bake Bread__ action, you can use this card once to turn 1 <GRAIN> into 2 <FOOD> and 1 bonus <SCORE>.',
  ],
  cost: { clay: 1 },
  extraVp: true,
})
