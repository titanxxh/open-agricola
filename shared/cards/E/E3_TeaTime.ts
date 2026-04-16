import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E3_TeaTime'

/**
 * E3 Tea Time (Minor Improvement, E, 3)
 * Immediately return your person on the Grain Utilization action space home;
 * you can place it again later this round.
 *
 * BGA onBuy: finds the farmer on ActionGrainUtilization belonging to the owner,
 * then calls returnHomeOne to bring them back.
 *
 * Prerequisite: own person on Grain Utilization (we enforce this via isBuyable
 * through the space.takenBy check).
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')
    if (!space || space.takenBy !== player.id) return
    space.takenBy = null
    player.workersAvailable += 1
  },
})

export const E3_TeaTime = new MinorImprovement({
  id: CARD_ID,
  name: 'Tea Time',
  deck: 'E',
  number: 3,
  category: 'ACTION_ENHANCER',
  desc: ['Immediately return your person on the Grain Utilization action space home; you can place it again later this round.'],
  cost: { food: 1 },
  passing: true,
  prerequisite: 'Own Person on Grain Utilization',
})
