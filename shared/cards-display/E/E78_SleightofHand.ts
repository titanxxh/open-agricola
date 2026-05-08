import { MinorImprovement } from '../types'

const CARD_ID = 'E78_SleightofHand'

export const E78_SleightofHand = new MinorImprovement({
  id: CARD_ID,
  name: 'Sleight of Hand',
  deck: 'E',
  number: 78,
  category: 'BUILDING_RESOURCES_-_REED',
  desc: ['When you play this card, you can immediately exchange up to 4 building resources for an equal number of other building resources.'],
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
