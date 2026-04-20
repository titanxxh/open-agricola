import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D52_RollingPin'

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

export const D52_RollingPin_impl = {
  effect: {
  id: CARD_ID,
  onReturnHome: (_state, player) => {
    const clay = player.resources.clay ?? 0
    const wood = player.resources.wood ?? 0
    if (clay <= wood) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
