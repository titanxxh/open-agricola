import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B123_RoofBallaster } from '../../cards-display/B/B123_RoofBallaster'

const CARD_ID = B123_RoofBallaster.id

export const B123_RoofBallaster_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const rooms = player.rooms
    if (rooms <= 0) return
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        gainLeaf(CARD_ID, { stone: rooms }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
