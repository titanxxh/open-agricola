import { MinorImprovement } from '../types'

const CARD_ID = 'B14_Hawktower'

export const B14_Hawktower = new MinorImprovement({
  id: CARD_ID,
  name: 'Hawktower',
  deck: 'B',
  number: 14,
  category: 'FARM_PLANNER',
  desc: ['Place a stone room on round space 12. If you live in a stone house at the start of the round, you can build the stone room at no cost. Otherwise, discard the stone room.'],
  cost: { clay: 2 },
  prerequisite: 'Play in Round 7 or Before',
})
