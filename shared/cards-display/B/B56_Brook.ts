import { MinorImprovement } from '../types'

const CARD_ID = 'B56_Brook'

export const B56_Brook = new MinorImprovement({
  id: CARD_ID,
  name: 'Brook',
  deck: 'B',
  number: 56,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use one of the four action spaces above the __Fishing__ accumulation space, you get 1 additional <FOOD>.'],
  cost: {},
  prerequisite: 'Farmer on Fishing Space',
})
