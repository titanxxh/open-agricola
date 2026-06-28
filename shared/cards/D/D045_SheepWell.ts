import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D045_SheepWell'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 food on each of the next round spaces, up to the number of sheep you have
    const n = player.resources.sheep ?? 0
    if (n === 0) return
    const entries = Array.from({ length: n }, (_, i) => ({
      round: state.round + 1 + i,
      resources: { food: 1 },
    })).filter((e) => e.round <= 14)

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

export const D045_SheepWell = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Sheep Well',
    deck: 'D',
    number: 45,
    category: 'FOOD_PROVIDER',
    desc: ['Place 1 <FOOD> on each of the next round spaces, up to the number of <SHEEP> you have. At the start of these rounds, you get the <FOOD>.'],
    cost: { stone: 2 },
    vp: 2,
  },
  impl: cardImpl,
})

export const D045_SheepWell_impl = D045_SheepWell.impl
