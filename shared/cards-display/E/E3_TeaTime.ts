import { MinorImprovement } from '../types'

const CARD_ID = 'E3_TeaTime'

export const E3_TeaTime = new MinorImprovement({
  id: CARD_ID,
  name: 'Tea Time',
  deck: 'E',
  number: 3,
  category: 'PASSING_-_ACTION_-_FARMYARD',
  desc: ['Immediately return your person on the __Grain Utilization__ action space home; you can place it again later this round.'],
  cost: { food: 1 },
  passing: true,
  prerequisite: 'Own Person on Grain Utilization',
})
