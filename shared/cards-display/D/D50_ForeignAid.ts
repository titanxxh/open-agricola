import { MinorImprovement } from '../types'

const CARD_ID = 'D50_ForeignAid'

export const D50_ForeignAid = new MinorImprovement({
  id: CARD_ID,
  name: 'Foreign Aid',
  deck: 'D',
  number: 50,
  category: 'FOOD_PROVIDER',
  desc: ['When you play this card, you immediately get 6 <FOOD>. You may no longer use the action spaces of rounds 12 to 14.'],
  cost: {},
  maxRound: 11,
  players: '1+',
})
