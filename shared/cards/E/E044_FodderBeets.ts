import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E044_FodderBeets'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const oddRounds = [3, 5, 7, 9, 11, 13].filter((r) => r > state.round)
    if (oddRounds.length === 0) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: oddRounds.map((round) => ({ round, resources: { food: 1 } })),
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E044_FodderBeets = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Fodder Beets',
    deck: 'E',
    number: 44,
    category: 'FOOD_-_FUTURE_ROUND_SPACES',
    desc: ['Place 1 <FOOD> on each remaining odd-numbered round space. At the start of these rounds, you get the <FOOD>.'],
    vp: 1,
    prerequisite: '3 Field Tiles',
  },
  impl: cardImpl,
})

export const E044_FodderBeets_impl = E044_FodderBeets.impl
