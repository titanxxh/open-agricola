import { MinorImprovement } from '../types'

const CARD_ID = 'D21_Recruitment'

export const D21_Recruitment = new MinorImprovement({
  id: CARD_ID,
  name: 'Recruitment',
  deck: 'D',
  number: 21,
  category: 'ACTIONS_BOOSTER',
  desc: ['From round 5 on, provided you have room in your house, each time you get a __Minor Improvement__ action, you can take a __Family Growth__ action instead.'],
  cost: { food: 1 },
  prerequisite: 'No People Left in the House',
})
