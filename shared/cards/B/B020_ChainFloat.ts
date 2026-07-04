import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B020_ChainFloat'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 7, resources: { field: 1 } },
        { round: base + 8, resources: { field: 1 } },
        { round: base + 9, resources: { field: 1 } },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B020_ChainFloat = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Chain Float',
    deck: 'B',
    number: 20,
    category: 'FARM_PLANNER',
    desc: ['Add 7, 8, and 9 to the current round and place 1 <FIELD> on each corresponding round space. At the start of these rounds, you can plow the <FIELD>.'],
    cost: { wood: 3 },
  },
  impl: cardImpl,
})

export const B020_ChainFloat_impl = B020_ChainFloat.impl
