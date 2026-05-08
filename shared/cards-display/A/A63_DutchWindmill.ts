import { MinorImprovement } from '../types'

const CARD_ID = 'A63_DutchWindmill'

export const A63_DutchWindmill = new MinorImprovement({
  id: CARD_ID,
  name: 'Dutch Windmill',
  deck: 'A',
  number: 63,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you take a __Bake Bread__ action in a round immediately following a harvest, you get 3 additional <FOOD>.'],
  cost: { wood: 2, stone: 2 },
  vp: 2,
})
