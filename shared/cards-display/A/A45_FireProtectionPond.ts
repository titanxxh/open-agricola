import { MinorImprovement } from '../types'

const CARD_ID = 'A45_FireProtectionPond'

export const A45_FireProtectionPond = new MinorImprovement({
  id: CARD_ID,
  name: 'Fire Protection Pond',
  deck: 'A',
  number: 45,
  category: 'FOOD_PROVIDER',
  desc: ['Once you no longer live in a wooden house, place 1 <FOOD> on each of the next 6 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { food: 1 },
  prerequisite: 'Still in Wooden House',
  newSet: true,
})
