import { MinorImprovement } from '../types'

const CARD_ID = 'B25_BreadPaddle'

export const B25_BreadPaddle = new MinorImprovement({
  id: CARD_ID,
  name: 'Bread Paddle',
  deck: 'B',
  number: 25,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you immediately get 1 <FOOD>. For each occupation you play, you get an additional __Bake Bread__ action.',
  ],
  cost: { wood: 1 },
})
