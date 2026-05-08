import { MinorImprovement } from '../types'

const CARD_ID = 'C27_Blueprint'

export const C27_Blueprint = new MinorImprovement({
  id: CARD_ID,
  name: 'Blueprint',
  deck: 'C',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: ["You can build the major improvements __Joinery__, __Pottery__, and __Basketmaker's Workshop__ even when taking a __Minor Improvement__ action. They each cost you 1 <STONE> less."],
  cost: { food: 1 },
})
