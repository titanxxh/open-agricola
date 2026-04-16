import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'A20_DoubleTurnPlow'

/**
 * A20 Double-Turn Plow (Minor Improvement):
 * When you play this card, you can immediately plow up to 2 fields.
 * Cost: 1 grain (+ 1 food after round 3). Can only be played in round 5 or before.
 *
 * BGA reference:
 * - getBaseCosts: grain:1, food:1 if turn > 3
 * - isBuyable: turn <= 5
 * - onBuy: seq(optional plow, optional plow)
 */

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'seq' as const,
    optional: true,
    children: [
      { type: 'leaf' as const, actionId: 'plow', sourceCard: CARD_ID, optional: true },
      { type: 'leaf' as const, actionId: 'plow', sourceCard: CARD_ID, optional: true },
    ],
  }),
})

// computeCosts: add 1 food after round 3
const computeCostsListener: CardListenerRegistration = {
  id: 'A20-double-turn-plow-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['minor-improvement', 'improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.cardId !== CARD_ID) return
    if (context.state.round <= 3) return
    return { costs: { food: 1 } }
  },
}

registerCardListener(computeCostsListener)

export const A20_DoubleTurnPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Double-Turn Plow',
  deck: 'A',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you can immediately plow up to 2 fields.'],
  cost: { grain: 1 },
  maxRound: 5,
  prerequisite: 'Round 5 or Before',
  evenMoreSet: true,
})
