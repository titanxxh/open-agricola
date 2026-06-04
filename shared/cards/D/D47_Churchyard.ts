import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D47_Churchyard'

const cardImpl = {
  prerequisiteCheck: (player) => {
    const total =
      player.occupationPlayed.length
      + player.minorPlayed.length
      + player.improvements.length
    return total >= 10
  },
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 2 food on each remaining round space (all remaining rounds up to 14)
    const count = 14 - state.round
    if (count <= 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 2 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D47_Churchyard = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Churchyard',
    deck: 'D',
    number: 47,
    category: 'FOOD_PROVIDER',
    desc: ['Place 2 <FOOD> on each remaining round space. At the start of these rounds, you get the <FOOD>. (*Occupations and Improvements)'],
    cost: { stone: 1, reed: 1 },
    vp: 1,
    prerequisite: '10 Cards* in Front of You',
  },
  impl: cardImpl,
})

export const D47_Churchyard_impl = D47_Churchyard.impl
