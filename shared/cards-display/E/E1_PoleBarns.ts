import { MinorImprovement } from '../types'

const CARD_ID = 'E1_PoleBarns'

export const E1_PoleBarns = new MinorImprovement({
  id: CARD_ID,
  name: 'Pole Barns',
  deck: 'E',
  number: 1,
  category: 'PASSING_-_FARMYARD',
  desc: ['You can immediately build up to 3 stables at no cost. (You must pay the cost of this card though.)'],
  cost: { wood: 2 },
  passing: true,
  prerequisite: '15 Fences Built',
})
