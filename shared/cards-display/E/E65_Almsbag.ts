import { MinorImprovement } from '../types'

const CARD_ID = 'E65_Almsbag'

export const E65_Almsbag = new MinorImprovement({
  id: CARD_ID,
  name: 'Almsbag',
  deck: 'E',
  number: 65,
  category: 'CROPS_-_GRAIN',
  desc: ['When you play this card, you immediately get 1 <GRAIN> for every 2 completed rounds.'],
  prerequisite: 'No Occupations',
  occupationPrerequisites: { max: 0 },
})
