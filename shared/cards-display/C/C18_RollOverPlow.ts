import { MinorImprovement } from '../types'

const CARD_ID = 'C18_RollOverPlow'

export const C18_RollOverPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Roll-Over Plow',
  deck: 'C',
  number: 18,
  category: 'FARM_PLANNER',
  desc: ['At any time, if you have at least 3 planted fields, you can discard all goods from one of those fields to plow 1 field.'],
  cost: { wood: 2 },
})
