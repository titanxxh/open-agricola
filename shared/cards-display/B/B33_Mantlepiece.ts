import { MinorImprovement } from '../types'

const CARD_ID = 'B33_Mantlepiece'

export const B33_Mantlepiece = new MinorImprovement({
  id: CARD_ID,
  name: 'Mantlepiece',
  deck: 'B',
  number: 33,
  category: 'POINTS_PROVIDER',
  desc: ['When you play this card, you immediately get 1 bonus <SCORE> for each complete round left to play. You may no longer renovate your house.'],
  cost: { stone: 1 },
  vp: -3,
  prerequisite: 'Clay or Stone House',
})
