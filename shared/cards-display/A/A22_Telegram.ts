import { MinorImprovement } from '../types'

const CARD_ID = 'A22_Telegram'

export const A22_Telegram = new MinorImprovement({
  id: CARD_ID,
  name: 'Telegram',
  deck: 'A',
  number: 22,
  category: 'ACTIONS_BOOSTER',
  desc: ['Add 1 to the current round for each fence in your supply and mark the corresponding round space. In that round only, you can place a person from your supply.'],
  cost: { food: 2 },
  prerequisite: 'At Least 1 Fence in Supply',
  vp: 1,
  evenMoreSet: true,
})
