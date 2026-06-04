import { defineOccupationCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D120_ClayDeliveryman'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 clay on each remaining space for rounds 6 to 14
    const absoluteRounds = [6, 7, 8, 9, 10, 11, 12, 13, 14]
    const entries = absoluteRounds
      .filter((r) => r > state.round)
      .map((round) => ({ round, resources: { clay: 1 } }))

    if (entries.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D120_ClayDeliveryman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Clay Deliveryman',
    deck: 'D',
    number: 120,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Place 1 <CLAY> on each remaining space for rounds 6 to 14. At the start of these rounds, you get the <CLAY>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D120_ClayDeliveryman_impl = D120_ClayDeliveryman.impl
