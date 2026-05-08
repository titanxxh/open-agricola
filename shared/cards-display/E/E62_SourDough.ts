import { MinorImprovement } from '../types'

const CARD_ID = 'E62_SourDough'

export const E62_SourDough = new MinorImprovement({
  id: CARD_ID,
  name: 'Sour Dough',
  deck: 'E',
  number: 62,
  desc: ['Once per round, if all players have at least 1 person left to place, you can skip placing a person and take a __Bake Bread__ action instead.'],
  cost: {},
  vp: 1,
  prerequisite: '3 Occupations and 1 Baking Improvement',
  occupationPrerequisites: { min: 3 },
})
