import { MinorImprovement } from '../types'

const CARD_ID = 'E79_FieldSpade'

export const E79_FieldSpade = new MinorImprovement({
  id: CARD_ID,
  name: 'Field Spade',
  deck: 'E',
  number: 79,
  category: 'BUILDING_RESOURCES_-_STONE',
  desc: ['Each time after you sow in at least 1 field, you get 1 <STONE>.'],
  cost: { wood: 1 },
})
