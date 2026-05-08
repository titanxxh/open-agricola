import { MinorImprovement } from '../types'

const CARD_ID = 'B18_GrasslandHarrow'

export const B18_GrasslandHarrow = new MinorImprovement({
  id: CARD_ID,
  name: 'Grassland Harrow',
  deck: 'B',
  number: 18,
  category: 'FARM_PLANNER',
  desc: [
    'Add 1 to the current round for each building resource in your supply and place 1 field on the corresponding round space. At the start of the round, you can plow the field.',
  ],
  cost: { wood: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  evenMoreSet: true,
})
