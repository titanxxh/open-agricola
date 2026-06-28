import { defineMinorCard } from '../card-source'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C003_CarriageTrip'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (workersAvailable(state, player) <= 0) return
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C003_CarriageTrip = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Carriage Trip",
    deck: "C",
    number: 3,
    category: "ACTIONS_BOOSTER",
    desc: ["If you play this card in the work phase, you can immediately place another person."],
    cost: {},
    passing: true,
    prerequisite: "1 Person yet to Place",
  },
  impl: cardImpl,
})

export const C003_CarriageTrip_impl = C003_CarriageTrip.impl
