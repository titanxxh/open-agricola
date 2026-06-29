import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E046_WaterlilyPond'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const count = Math.min(2, 14 - state.round)
    if (count <= 0) return

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

export const E046_WaterlilyPond = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Waterlily Pond',
    deck: 'E',
    number: 46,
    category: 'FOOD_-_FUTURE_ROUND_SPACES',
    desc: ['Place 1 <FOOD> on each of the next 2 round spaces. At the start of these rounds, you get the <FOOD>.'],
    vp: 1,
    prerequisite: 'Exactly 2 Occupations',
    occupationPrerequisites: { min: 2, max: 2 },
  },
  impl: cardImpl,
})

export const E046_WaterlilyPond_impl = E046_WaterlilyPond.impl
