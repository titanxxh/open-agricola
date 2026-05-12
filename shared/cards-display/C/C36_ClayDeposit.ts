import { MinorImprovement } from '../types'

const CARD_ID = 'C36_ClayDeposit'

export const C36_ClayDeposit = new MinorImprovement({
  id: CARD_ID,
  name: 'Clay Deposit',
  deck: 'C',
  number: 36,
  category: 'POINTS_PROVIDER',
  desc: [
    'Immediately after each time you use a clay accumulation space, you can exchange 1 <CLAY> for 1 bonus <SCORE>. If you do, place the <CLAY> on the accumulation space.',
  ],
  cost: { food: 2 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
