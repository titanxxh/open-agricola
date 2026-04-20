import { MinorImprovement } from '../types'
import { workersAvailable } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C3_CarriageTrip'

export const C3_CarriageTrip = new MinorImprovement({
  id: CARD_ID,
  name: "Carriage Trip",
  deck: "C",
  number: 3,
  category: "ACTIONS_BOOSTER",
  desc: ["If you play this card in the work phase, you can immediately place another person."],
  cost: { food: 3 },
  passing: true,
  prerequisite: "1 Person yet to Place",
})

export const C3_CarriageTrip_impl = {
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
