import { Occupation } from '../types'

const CARD_ID = 'A153_PigOwner'

export const A153_PigOwner = new Occupation({
  id: CARD_ID,
  name: 'Pig Owner',
  deck: 'A',
  number: 153,
  category: 'POINTS_PROVIDER',
  desc: ['The first time after you play this card that you have 5 <PIG> on your farm, you immediately get 3 bonus <SCORE>.'],
  cost: {},
  players: '4+',
  extraVp: true,
})
