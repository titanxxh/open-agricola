import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E045_FruitLadder'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const evenRounds = [2, 4, 6, 8, 10, 12, 14].filter((r) => r > state.round)
    if (evenRounds.length === 0) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: evenRounds.map((round) => ({ round, resources: { food: 1 } })),
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E045_FruitLadder = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Fruit Ladder',
    deck: 'E',
    number: 45,
    category: 'FOOD',
    desc: ['Place 1 <FOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <FOOD>.'],
    vp: 1,
    cost: { wood: 2 },
  },
  impl: cardImpl,
})

export const E045_FruitLadder_impl = E045_FruitLadder.impl
