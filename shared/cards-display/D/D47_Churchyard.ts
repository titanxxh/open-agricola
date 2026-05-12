import { MinorImprovement } from '../types'

const CARD_ID = 'D47_Churchyard'

export const D47_Churchyard = new MinorImprovement({
  id: CARD_ID,
  name: 'Churchyard',
  deck: 'D',
  number: 47,
  category: 'FOOD_PROVIDER',
  desc: ['Place 2 <FOOD> on each remaining round space. At the start of these rounds, you get the <FOOD>. (*Occupations and Improvements)'],
  cost: { stone: 1, reed: 1 },
  vp: 1,
  prerequisite: '10 Cards* in Front of You',
})
