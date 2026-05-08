import { MinorImprovement } from '../types'

const CARD_ID = 'B26_AgrarianFences'

export const B26_AgrarianFences = new MinorImprovement({
  id: CARD_ID,
  name: 'Agrarian Fences',
  deck: 'B',
  number: 26,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time you use the __Grain Utilization__ action space, you can take a __Build Fences__ action instead of one of the two actions provide by the action space.',
  ],
  cost: { wood: 1 },
})
