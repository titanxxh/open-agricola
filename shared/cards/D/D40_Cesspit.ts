import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'D40_Cesspit'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    // Alternate placing 1 clay and 1 boar on remaining round spaces starting with clay
    // clay on rounds +1, +3, +5, +7, +9, +11, +13 (relative offsets from current round)
    // boar on rounds +2, +4, +6, +8, +10, +12
    const clayOffsets = [1, 3, 5, 7, 9, 11, 13]
    const boarOffsets = [2, 4, 6, 8, 10, 12]

    const clayEntries = clayOffsets
      .map((offset) => ({ round: state.round + offset, resources: { clay: 1 } }))
      .filter((e) => e.round <= 14)

    const boarEntries = boarOffsets
      .map((offset) => ({ round: state.round + offset, resources: { boar: 1 } }))
      .filter((e) => e.round <= 14)

    if (clayEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: clayEntries,
      })
    }
    if (boarEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: boarEntries,
      })
    }
    return futureMeeplesNode()
  },
})

export const D40_Cesspit = new MinorImprovement({
  id: CARD_ID,
  name: 'Cesspit',
  deck: 'D',
  number: 40,
  category: 'GOODS_PROVIDER',
  desc: ['Alternate placing 1 <CLAY> and 1 <PIG> on each remaining round space, starting with <CLAY>. At the start of these rounds, you get the respective good.'],
  cost: {},
  vp: -1,
  prerequisite: '2 Fields and 1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})
