import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { getFenceCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'A47_Trellises'

export const A47_Trellises = new MinorImprovement({
  id: CARD_ID,
  name: 'Trellises',
  deck: 'A',
  number: 47,
  category: 'FOOD_PROVIDER',
  desc: ['Immediately place 1 <FOOD> on each of the next round spaces, up to the number of fences you have built. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  newSet: true,
})

export const A47_Trellises_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const n = getFenceCount(player)
    if (n <= 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: n,
      resources: { food: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
