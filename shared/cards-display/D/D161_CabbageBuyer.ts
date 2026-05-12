import { Occupation } from '../types'

const CARD_ID = 'D161_CabbageBuyer'

export const D161_CabbageBuyer = new Occupation({
  id: CARD_ID,
  name: 'Cabbage Buyer',
  deck: 'D',
  number: 161,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time any player (including you) renovates and then builds no/1 minor/1 major improvement, you can buy 1 <VEGETABLE> for 3/2/1 <FOOD>.',
  ],
  cost: {},
  players: '4+',
})
