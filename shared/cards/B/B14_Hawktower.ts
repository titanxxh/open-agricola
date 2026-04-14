import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'B14_Hawktower'

// BGA: place a stone room on round space 12. If stone house at start of that round, build for free; else discard.
// Simplified: place 1 stone on round 12. TODO: conditional room build at round 12.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: 12, resources: { stone: 1 } }],
    })
  },
})

export const B14_Hawktower = new MinorImprovement({
  id: CARD_ID,
  name: 'Hawktower',
  deck: 'B',
  number: 14,
  category: 'FARM_PLANNER',
  desc: ['Place a stone room on round space 12. If you live in a stone house at the start of the round, you can build the stone room at no cost. Otherwise, discard the stone room.'],
  cost: { clay: 2 },
  prerequisite: 'Play in Round 7 or Before',
})
