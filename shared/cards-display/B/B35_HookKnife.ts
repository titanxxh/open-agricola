import { MinorImprovement } from '../types'

const CARD_ID = 'B35_HookKnife'

export const B35_HookKnife = new MinorImprovement({
  id: CARD_ID,
  name: 'Hook Knife',
  deck: 'B',
  number: 35,
  category: 'POINTS_PROVIDER',
  desc: ['Once this game, when you have 9/8/7/6/5/5 <SHEEP> on your farm in a 1-/2-/3-/4-/5-/6- player game, you immediately get 2 bonus <SCORE>.'],
  cost: { wood: 1 },
  extraVp: true,
})
