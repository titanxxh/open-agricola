import { MinorImprovement } from '../types'

const CARD_ID = 'D26_CarpentersYard'

export const D26_CarpentersYard = new MinorImprovement({
  id: CARD_ID,
  name: "Carpenter's Yard",
  deck: 'D',
  number: 26,
  category: 'ACTIONS_BOOSTER',
  desc: ['You can build the __Joinery__ and __Well__ major improvement even when taking a __Minor Improvement__ action, or you can build both with a single __Major Improvement__ action.'],
  cost: { wood: 1, reed: 1 },
  vp: 1,
  evenMoreSet: true,
})
