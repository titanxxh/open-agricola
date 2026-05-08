import { MinorImprovement } from '../types'

const CARD_ID = 'A4_Baseboards'

export const A4_Baseboards = new MinorImprovement({
  id: CARD_ID,
  name: 'Baseboards',
  deck: 'A',
  number: 4,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['You immediately get 1 <WOOD> for each room you have. If you have more rooms than people, you get 1 additional <WOOD>.'],
  altCosts: [{ food: 2 }, { grain: 1 }],
  passing: true,
})
