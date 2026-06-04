import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D44_ForestWell'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 food on each remaining round space, up to the amount of wood in supply
    const n = player.resources.wood ?? 0
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

export const D44_ForestWell = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Forest Well',
    deck: 'D',
    number: 44,
    category: 'FOOD_PROVIDER',
    desc: ['Place 1 <FOOD> on each remaining round space, up to the amount of <WOOD> in your supply. At the start of these rounds, you get the <FOOD>.'],
    cost: { stone: 1, food: 1 },
    vp: 1,
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const D44_ForestWell_impl = D44_ForestWell.impl
