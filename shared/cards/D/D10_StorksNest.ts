import { payLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { D10_StorksNest } from '../../cards-display/D/D10_StorksNest'
export { D10_StorksNest }

const CARD_ID = 'D10_StorksNest'

export const D10_StorksNest_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    if (player.rooms <= familySize(player)) return
    if (player.resources.food < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        {
          type: 'leaf',
          actionId: 'wish-children',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
