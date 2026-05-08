import { MinorImprovement } from '../types'

const CARD_ID = 'B84_AcornsBasket'

export const B84_AcornsBasket = new MinorImprovement({
  id: CARD_ID,
  name: 'Acorns Basket',
  deck: 'B',
  number: 84,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Place 1 <PIG> on each of the next 2 round spaces. At the start of these rounds, you get the <PIG>.'],
  cost: { reed: 1 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
