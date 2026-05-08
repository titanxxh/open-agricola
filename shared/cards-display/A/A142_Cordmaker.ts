import { Occupation } from '../types'

const CARD_ID = 'A142_Cordmaker'

export const A142_Cordmaker = new Occupation({
  id: CARD_ID,
  name: 'Cordmaker',
  deck: 'A',
  number: 142,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time any player (including you) takes at least 2 <REED> from the __Reed Bank__ accumulation space, you can choose to take 1 <GRAIN> or buy 1 <VEGETABLE> for 2 <FOOD>.',
  ],
  cost: {},
  players: '3+',
})
