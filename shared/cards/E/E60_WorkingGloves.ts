import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E60_WorkingGloves'

/**
 * E60 Working Gloves — MinorImprovement (#60, < 81, so minorPlayed).
 * When you play this card, you get 1 food.
 * Each time you pay an occupation cost, you can pay 1 building resource of your
 * choice in place of (up to) 2 food.
 *
 * BGA: onBuy → gain 1 food.
 * onPlayerComputeCostsOccupation → for trades with food, add alternatives
 *   substituting 1 of {wood,clay,reed,stone} for up to 2 food.
 *
 * Simplified: apply { food: -2 } discount on occupation cost when played.
 * This is equivalent to eliminating the food component (up to 2 food) of the cost.
 */

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { food: 1 }),
})

const computeCostsListener: CardListenerRegistration = {
  id: 'E60-working-gloves-compute-costs-occupation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['occupation', 'play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    // Substitute up to 2 food with 1 building resource (simplified: -2 food discount)
    return { costs: { food: -2 } }
  },
}

registerCardListener(computeCostsListener)

export const E60_WorkingGloves = new MinorImprovement({
  id: CARD_ID,
  name: 'Working Gloves',
  deck: 'E',
  number: 60,
  category: 'FOOD_-_CONVERT',
  desc: [
    'When you play this card, you get 1 <FOOD>. Each time you pay an occupation cost, you can pay 1 building resource of your choice in place of (up to) 2 <FOOD>.',
  ],
  cost: {},
})
