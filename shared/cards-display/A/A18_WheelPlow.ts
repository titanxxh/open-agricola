import { MinorImprovement } from '../types'

const CARD_ID = 'A18_WheelPlow'

export const A18_WheelPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Wheel Plow',
  deck: 'A',
  number: 18,
  category: 'FARM_PLANNER',
  desc: ['Once this game, when you use the __Farmland__ or __Cultivation__ action space with the first person you place in a round, you can plow 2 additional fields.'],
  cost: { wood: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
