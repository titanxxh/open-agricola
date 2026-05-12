import { MinorImprovement } from '../types'

const CARD_ID = 'D3_Furrows'

export const D3_Furrows = new MinorImprovement({
  id: CARD_ID,
  name: 'Furrows',
  deck: 'D',
  number: 3,
  category: 'ACTIONS_BOOSTER',
  desc: ['You can immediately sow in exactly 1 field.'],
  cost: {},
  passing: true,
})
