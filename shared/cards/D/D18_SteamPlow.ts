import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D18_SteamPlow } from '../../cards-display/D/D18_SteamPlow'

const CARD_ID = D18_SteamPlow.id

export const D18_SteamPlow_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    // Check player can afford the cost
    if ((player.resources.wood ?? 0) < 2 || (player.resources.food ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { wood: 2, food: 1 } }),
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
