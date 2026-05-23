import { MinorImprovement } from '../types'

const CARD_ID = 'E5_NightLoot'

export const E5_NightLoot = new MinorImprovement({
  id: CARD_ID,
  name: 'Night Loot',
  deck: 'E',
  number: 5,
  category: 'PASSING_-_BUILDING_RESOURCES_',
  desc: ['Immediately remove 2 different building resources total from accumulation spaces and place them in your supply.'],
  cost: { food: 2 },
  passing: true,
})
