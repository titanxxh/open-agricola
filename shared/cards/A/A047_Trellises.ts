import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { getFenceCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'A047_Trellises'

const cardImpl = {
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

export const A047_Trellises = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Trellises',
    deck: 'A',
    number: 47,
    category: 'FOOD_PROVIDER',
    desc: ['Immediately place 1 <FOOD> on each of the next round spaces, up to the number of <FENCE> you have built. At the start of these rounds, you get the <FOOD>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const A047_Trellises_impl = A047_Trellises.impl
