import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A90_PlowDriver } from '../../cards-display/A/A90_PlowDriver'

const CARD_ID = A90_PlowDriver.id

export const A90_PlowDriver_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'stone') return
    if ((player.resources.food ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
