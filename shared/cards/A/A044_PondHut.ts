import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'A044_PondHut'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) =>
    queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 3,
      resources: { food: 1 },
    }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A044_PondHut = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Pond Hut',
    deck: 'A',
    number: 44,
    category: 'FOOD_PROVIDER',
    desc: ['Place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.'],
    cost: { wood: 1 },
    vp: 1,
    prerequisite: 'Exactly 2 Occupations',
    occupationPrerequisites: { min: 2, max: 2 },
  },
  impl: cardImpl,
})

export const A044_PondHut_impl = A044_PondHut.impl
