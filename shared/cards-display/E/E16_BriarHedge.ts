import { MinorImprovement } from '../types'

const CARD_ID = 'E16_BriarHedge'

export const E16_BriarHedge = new MinorImprovement({
  id: CARD_ID,
  name: 'Briar Hedge',
  deck: 'E',
  number: 16,
  desc: ['You do not need to pay wood for fences that you build on the edge of your farmyard board.'],
  cost: {},
  prerequisite: '1 Animal of Each Type',
  category: 'FARMYARD_-__FENCING_OR_STABLE_BUILDING',
})
