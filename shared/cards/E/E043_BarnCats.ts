import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { getStableCountForCards } from '../../domain/stables'
import type { CardImpl } from '../registry'

const CARD_ID = 'E043_BarnCats'

const cardImpl = {
  prerequisiteCheck: (player) => getStableCountForCards(player) >= 1,
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const stables = getStableCountForCards(player)
    if (stables === 0) return

    // 1 stable → 2 rounds, 2 → 3, 3 → 4, 4 → 5
    const count = Math.min(stables + 1, 5)

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 1 },
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E043_BarnCats = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Barn Cats',
    deck: 'E',
    number: 43,
    category: 'FOOD_-_FUTURE_ROUND_SPACES',
    desc: ['If you have 1/2/3/4 stables, place 1 <FOOD> on each of the next 2/3/4/5 round spaces. At the start of these rounds, you get the <FOOD>.'],
    vp: 1,
    prerequisite: '1 Stable',
  },
  impl: cardImpl,
})

export const E043_BarnCats_impl = E043_BarnCats.impl
