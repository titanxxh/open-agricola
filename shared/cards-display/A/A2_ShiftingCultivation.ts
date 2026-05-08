import { MinorImprovement } from '../types'

const CARD_ID = 'A2_ShiftingCultivation'

export const A2_ShiftingCultivation = new MinorImprovement({
  id: CARD_ID,
  name: 'Shifting Cultivation',
  deck: 'A',
  number: 2,
  category: 'FARM_PLANNER',
  desc: ['Immediately plow 1 field.'],
  cost: { food: 2 },
  passing: true,
})
