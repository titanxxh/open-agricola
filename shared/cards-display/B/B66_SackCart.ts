import { MinorImprovement } from '../types'

const CARD_ID = 'B66_SackCart'

export const B66_SackCart = new MinorImprovement({
  id: CARD_ID,
  name: 'Sack Cart',
  deck: 'B',
  number: 66,
  category: 'CROP_PROVIDER',
  desc: ['Place 1 <GRAIN> each on the remaining spaces for rounds 5, 8, 11, and 14. At the start of these rounds, you get the <GRAIN>.'],
  cost: { wood: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
