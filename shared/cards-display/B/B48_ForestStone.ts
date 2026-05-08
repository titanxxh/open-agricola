import { MinorImprovement } from '../types'

const CARD_ID = 'B48_ForestStone'

export const B48_ForestStone = new MinorImprovement({
  id: CARD_ID,
  name: 'Forest Stone',
  deck: 'B',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: ['Place 2 <FOOD> on this card. Each time you use a wood accumulation space, move 1 of these <FOOD> to your supply. Each time you use a stone accumulation space, add 2 <FOOD> to this card.'],
  cost: { wood: 2, stone: 1 },
  vp: 1,
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})
