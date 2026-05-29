import { MinorImprovement } from '../types'

const CARD_ID = 'C11_WildlifeReserve'

export const C11_WildlifeReserve = new MinorImprovement({
  id: CARD_ID,
  name: 'Wildlife Reserve',
  deck: 'C',
  number: 11,
  category: 'FARM_PLANNER',
  desc: ['This card can hold up to 1 <SHEEP>, 1 <PIG>, and 1 <CATTLE>.'],
  cost: { wood: 2 },
  animalHolder: true,
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
