import { MinorImprovement } from '../types'

const CARD_ID = 'E12_AnimalBedding'

export const E12_AnimalBedding = new MinorImprovement({
  id: CARD_ID,
  name: 'Animal Bedding',
  deck: 'E',
  number: 12,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['You can keep 1 additional animal (of the same type) in each of your unfenced stables, and 2 additional animals (of the same type) in each pasture with stable.'],
  cost: {},
  vp: 1,
  prerequisite: '1 Grain Field',
})
