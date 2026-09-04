import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'A019_Handplow'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const targetRound = state.round + 5
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: targetRound, resources: { field: 1 } }],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A019_Handplow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Handplow',
    deck: 'A',
    number: 19,
    category: 'FARM_PLANNER',
    desc: ['Add 5 to the current round and place 1 <FIELD> tile on the corresponding round space. At the start of that round, you can plow the <FIELD>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const A019_Handplow_impl = A019_Handplow.impl
