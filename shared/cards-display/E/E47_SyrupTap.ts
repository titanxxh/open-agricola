import { MinorImprovement } from '../types'

const CARD_ID = 'E47_SyrupTap'

export const E47_SyrupTap = new MinorImprovement({
  id: CARD_ID,
  name: 'Syrup Tap',
  deck: 'E',
  number: 47,
  desc: ['Each time you get at least 1 <WOOD> from an action space, place 1 <FOOD> on the next round space. At the start of that round, you get the <FOOD>.'],
  cost: { wood: 1, stone: 1 },
  vp: 1,
})
