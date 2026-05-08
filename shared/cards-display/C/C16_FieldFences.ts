import { MinorImprovement } from '../types'

const CARD_ID = 'C16_FieldFences'

export const C16_FieldFences = new MinorImprovement({
  id: CARD_ID,
  name: 'Field Fences',
  deck: 'C',
  number: 16,
  category: 'FARM_PLANNER',
  desc: ['You can immediately take a __Build Fences__ action, during which you do not have to pay <WOOD> for fences that you build next to field tiles.'],
  cost: { food: 2 },
})
