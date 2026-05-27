import { MinorImprovement } from '../types'

const CARD_ID = 'D1_ZigzagHarrow'

export const D1_ZigzagHarrow = new MinorImprovement({
  id: CARD_ID,
  name: 'Zigzag Harrow',
  deck: 'D',
  number: 1,
  category: 'FARM_PLANNER',
  desc: ['You can immediately plow 1 field such that it completes a "zigzag" pattern.'],
  cost: { wood: 1 },
  prerequisite: '3 Fields in an "L" Shape',
  passing: true,
})
