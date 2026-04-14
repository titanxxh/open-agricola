import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C21_HeartofStone'

// C21 Heart of Stone: Each time a Quarry accumulation space is revealed, if you have room
// in your house, you can immediately take a Family Growth action without placing a person.
// BGA: AfterRevealAction event, checks for western/eastern quarry reveal.
// In our system, the closest hook is onRoundStart — check if the revealed round action is a quarry.
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const revealedAction = state.roundActionOrder[state.round - 1]
    if (revealedAction !== 'western-quarry' && revealedAction !== 'eastern-quarry') return
    // Check if player has room in house (fewer family members than rooms)
    if (player.familySize >= player.roomTiles.length) return
    return {
      type: 'leaf',
      actionId: 'wish-children',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { constraints: ['freeRoom'], trueAction: false },
    }
  },
})

export const C21_HeartofStone = new MinorImprovement({
  id: CARD_ID,
  name: 'Heart of Stone',
  deck: 'C',
  number: 21,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time a __Quarry__ accumulation space is revealed, if you have room in your house, you can immediately take a __Family Growth__ action without placing a person.',
  ],
  cost: { food: 4 },
  newSet: true,
})
