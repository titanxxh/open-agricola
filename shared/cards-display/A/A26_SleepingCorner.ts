import { MinorImprovement } from '../types'

const CARD_ID = 'A26_SleepingCorner'

export const A26_SleepingCorner = new MinorImprovement({
  id: CARD_ID,
  name: 'Sleeping Corner',
  deck: 'A',
  number: 26,
  category: 'ACTIONS_BOOSTER',
  desc: ["You can use any __Wish for Children__ action space even if it is occupied by one other player's person."],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '2 Grain Fields',
})
