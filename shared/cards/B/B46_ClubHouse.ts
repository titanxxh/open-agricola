import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B46_ClubHouse'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 1, resources: { food: 1 } },
        { round: base + 2, resources: { food: 1 } },
        { round: base + 3, resources: { food: 1 } },
        { round: base + 4, resources: { food: 1 } },
        { round: base + 5, resources: { stone: 1 } },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B46_ClubHouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Club House',
    deck: 'B',
    number: 46,
    category: 'FOOD_PROVIDER',
    desc: ['Place 1 <FOOD> on each of the next 4 round spaces and 1 <STONE> on the round space after that. At the start of these rounds, you get the respective good.'],
    cost: {},
    altCosts: [{ wood: 3 }, { clay: 2 }],
    vp: 1,
  },
  impl: cardImpl,
})

export const B46_ClubHouse_impl = B46_ClubHouse.impl
