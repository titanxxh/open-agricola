import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D52_RollingPin'

// D52 Rolling Pin: In the returning home phase of each round, if you have more clay than
// wood in your supply, you get 1 food.
registerCardEffect({
  id: CARD_ID,
  onReturnHome: (_state, player) => {
    const clay = player.resources.clay ?? 0
    const wood = player.resources.wood ?? 0
    if (clay <= wood) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
})

export const D52_RollingPin = new MinorImprovement({
  id: CARD_ID,
  name: 'Rolling Pin',
  deck: 'D',
  number: 52,
  category: 'FOOD_PROVIDER',
  desc: ['In the returning home phase of each round, if you have more <CLAY> than <WOOD> in your supply, you get 1 <FOOD>.'],
  cost: { wood: 1 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})
