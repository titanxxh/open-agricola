import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B041_Hauberg'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 1, resources: { wood: 2 } },
        { round: base + 2, resources: { boar: 1 } },
        { round: base + 3, resources: { wood: 2 } },
        { round: base + 4, resources: { boar: 1 } },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B041_Hauberg = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Hauberg',
    deck: 'B',
    number: 41,
    category: 'GOODS_PROVIDER',
    desc: ['Alternate placing 2 <WOOD> and 1 <PIG> on the next 4 round spaces. You decide what to start with. At the start of these rounds, you get the goods.'],
    cost: { food: 3 },
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
  },
  impl: cardImpl,
})

export const B041_Hauberg_impl = B041_Hauberg.impl
