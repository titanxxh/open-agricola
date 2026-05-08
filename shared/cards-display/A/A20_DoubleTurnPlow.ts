import { MinorImprovement } from '../types'

const CARD_ID = 'A20_DoubleTurnPlow'

export const A20_DoubleTurnPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Double-Turn Plow',
  deck: 'A',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you can immediately plow up to 2 fields.'],
  cost: { grain: 1 },
  maxRound: 5,
  prerequisite: 'Round 5 or Before',
  evenMoreSet: true,
})
