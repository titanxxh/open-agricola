import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'B41_Hauberg'

// BGA: choose to alternate 2 wood / 1 pig or 1 pig / 2 wood on next 4 rounds.
// Simplified: always place 2 wood on +1,+3 and 1 pig on +2,+4.
// TODO: implement xor choice between two orderings.
registerCardEffect({
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
})

export const B41_Hauberg = new MinorImprovement({
  id: CARD_ID,
  name: 'Hauberg',
  deck: 'B',
  number: 41,
  category: 'RESOURCE_WOOD',
  desc: ['Alternate placing 2 <WOOD> and 1 <PIG> on the next 4 round spaces. You decide what to start with. At the start of these rounds, you get the goods.'],
  cost: { food: 3 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
