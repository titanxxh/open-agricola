import { MinorImprovement } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D43_Hutch'

export const D43_Hutch = new MinorImprovement({
  id: CARD_ID,
  name: 'Hutch',
  deck: 'D',
  number: 43,
  category: 'FOOD_PROVIDER',
  desc: ['Place 0, 1, 2, and 3 <FOOD> in this order on the next 4 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1, reed: 1 },
  vp: 1,
})

export const D43_Hutch_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 0, 1, 2, 3 food on next 4 round spaces (rounds +1 gets 0, +2 gets 1, +3 gets 2, +4 gets 3)
    // Round +1 gets 0 food (nothing to queue), +2 gets 1, +3 gets 2, +4 gets 3
    const entries = [
      { round: state.round + 2, resources: { food: 1 } },
      { round: state.round + 3, resources: { food: 2 } },
      { round: state.round + 4, resources: { food: 3 } },
    ].filter((e) => e.round <= 14)

    if (entries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries,
      })
    }
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
