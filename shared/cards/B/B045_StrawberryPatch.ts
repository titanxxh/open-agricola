import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'B045_StrawberryPatch'

const cardImpl = {
  prerequisiteCheck: (player) =>
    player.fields.filter((f) => fieldHasCrop(f, 'vegetable')).length >= 2,
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 3,
      resources: { food: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B045_StrawberryPatch = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Strawberry Patch',
    deck: 'B',
    number: 45,
    category: 'FOOD_PROVIDER',
    desc: ['Place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.'],
    cost: { wood: 1 },
    vp: 2,
    prerequisite: '2 Vegetable Fields',
  },
  impl: cardImpl,
})

export const B045_StrawberryPatch_impl = B045_StrawberryPatch.impl
