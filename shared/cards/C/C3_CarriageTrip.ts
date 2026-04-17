import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { workersAvailable } from '../../game/player'

const CARD_ID = 'C3_CarriageTrip'

// C3 CarriageTrip: If played during work phase and player has a farmer available,
// immediately place another person. Simplified: grant an optional place-farmer action.
registerCardEffect({
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
})

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
