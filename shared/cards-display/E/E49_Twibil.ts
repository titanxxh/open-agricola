import { MinorImprovement } from '../types'

const CARD_ID = 'E49_Twibil'

export const E49_Twibil = new MinorImprovement({
  id: CARD_ID,
  name: 'Twibil',
  deck: 'E',
  number: 49,
  category: 'FOOD',
  desc: [
    'Each time after any player (including you) builds at least 1 wood room, you get 1 <FOOD>.',
  ],
  cost: { stone: 1 },
  vp: 1,
})
