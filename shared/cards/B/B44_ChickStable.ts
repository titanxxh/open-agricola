import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B44_ChickStable'

export const B44_ChickStable = new MinorImprovement({
  id: CARD_ID,
  name: 'Chick Stable',
  deck: 'B',
  number: 44,
  category: 'FOOD_PROVIDER',
  desc: ['Add 3 and 4 to the current round and place 2 <FOOD> on each corresponding round space. At the start of these rounds, you get the <FOOD>.'],
  cost: {},
  altCosts: [{ wood: 1 }, { clay: 1 }],
})

export const B44_ChickStable_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 3, resources: { food: 2 } },
        { round: base + 4, resources: { food: 2 } },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
