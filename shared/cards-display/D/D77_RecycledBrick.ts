import { MinorImprovement } from '../types'

const CARD_ID = 'D77_RecycledBrick'

export const D77_RecycledBrick = new MinorImprovement({
  id: CARD_ID,
  name: 'Recycled Brick',
  deck: 'D',
  number: 77,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time any player (including you) renovates to stone, you get 1 <CLAY> for each newly renovated room.'],
  cost: { food: 1 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
