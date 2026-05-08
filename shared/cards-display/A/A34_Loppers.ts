import { MinorImprovement } from '../types'

const CARD_ID = 'A34_Loppers'

export const A34_Loppers = new MinorImprovement({
  id: CARD_ID,
  name: 'Loppers',
  deck: 'A',
  number: 34,
  category: 'POINTS_PROVIDER',
  desc: ['Each time you build 1 or more fences, you can also use this card to exchange 1 <WOOD> and 1 <FENCE> in your supply for 2 <FOOD> and 1 bonus <SCORE>.'],
  cost: { wood: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  extraVp: true,
})
