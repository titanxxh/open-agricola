import { payThenGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D6_PetrifiedWood } from '../../cards-display/D/D6_PetrifiedWood'

const CARD_ID = D6_PetrifiedWood.id

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
