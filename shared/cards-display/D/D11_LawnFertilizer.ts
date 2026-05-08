import { MinorImprovement } from '../types'

const CARD_ID = 'D11_LawnFertilizer'

export const D11_LawnFertilizer = new MinorImprovement({
  id: CARD_ID,
  name: 'Lawn Fertilizer',
  deck: 'D',
  number: 11,
  category: 'FARM_PLANNER',
  desc: ['Your pastures of size 1 can hold up to 3 animals of the same type. (With a stable, they can hold up to 6 animals of the same type.)'],
  cost: {},
  newSet: true,
})
