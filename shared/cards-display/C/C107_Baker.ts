import { Occupation } from '../types'

const CARD_ID = 'C107_Baker'

export const C107_Baker = new Occupation({
  id: CARD_ID,
  name: 'Baker',
  deck: 'C',
  number: 107,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card and at the start of each feeding phase, you can take a __Bake Bread__ action.',
  ],
  cost: {},
  players: '1+',
})
