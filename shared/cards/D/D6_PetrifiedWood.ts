import { MinorImprovement } from '../types'
import { payThenGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D6_PetrifiedWood'

export const D6_PetrifiedWood = new MinorImprovement({
  id: CARD_ID,
  name: 'Petrified Wood',
  deck: 'D',
  number: 6,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Immediately exchange up to 3 <WOOD> for 1 <STONE> each.'],
  cost: {},
  passing: true,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})

export const D6_PetrifiedWood_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const wood = player.resources.wood ?? 0
    if (wood === 0) return
    const maxExchange = Math.min(wood, 3)
    const children = Array.from({ length: maxExchange }, (_, i) => {
      const n = i + 1
      return payThenGainActionFlow({
        cardId: CARD_ID,
        cost: { wood: n },
        gain: { stone: n },
      })
    })
    return {
      type: 'xor' as const,
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
