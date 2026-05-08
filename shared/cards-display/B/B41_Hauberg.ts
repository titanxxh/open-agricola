import { MinorImprovement } from '../types'

const CARD_ID = 'B41_Hauberg'

export const B41_Hauberg = new MinorImprovement({
  id: CARD_ID,
  name: 'Hauberg',
  deck: 'B',
  number: 41,
  category: 'GOODS_PROVIDER',
  desc: ['Alternate placing 2 <WOOD> and 1 <PIG> on the next 4 round spaces. You decide what to start with. At the start of these rounds, you get the goods.'],
  cost: { food: 3 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
