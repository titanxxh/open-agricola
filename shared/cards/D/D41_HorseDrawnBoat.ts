import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'D41_HorseDrawnBoat'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    // Alternate placing 1 food and 1 sheep on remaining round spaces starting with food
    // food on rounds +1, +3, +5, +7, +9, +11, +13 (relative offsets)
    // sheep on rounds +2, +4, +6, +8, +10, +12
    const foodOffsets = [1, 3, 5, 7, 9, 11, 13]
    const sheepOffsets = [2, 4, 6, 8, 10, 12]

    const foodEntries = foodOffsets
      .map((offset) => ({ round: state.round + offset, resources: { food: 1 } }))
      .filter((e) => e.round <= 14)

    const sheepEntries = sheepOffsets
      .map((offset) => ({ round: state.round + offset, resources: { sheep: 1 } }))
      .filter((e) => e.round <= 14)

    if (foodEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: foodEntries,
      })
    }
    if (sheepEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: sheepEntries,
      })
    }
    return futureMeeplesNode()
  },
})

export const D41_HorseDrawnBoat = new MinorImprovement({
  id: CARD_ID,
  name: 'Horse-Drawn Boat',
  deck: 'D',
  number: 41,
  category: 'GOODS_PROVIDER',
  desc: ['Alternate placing 1 <FOOD> and 1 <SHEEP> on each remaining round space, starting with <FOOD>. At the start of these rounds, you get the respective good.'],
  cost: { wood: 2 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
