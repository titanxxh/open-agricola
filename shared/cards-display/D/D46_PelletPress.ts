import { MinorImprovement } from '../types'

const CARD_ID = 'D46_PelletPress'

export const D46_PelletPress = new MinorImprovement({
  id: CARD_ID,
  name: 'Pellet Press',
  deck: 'D',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: [
    'Once per round, you can pay 1 <REED>. If you do, place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: { clay: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
