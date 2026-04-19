import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A27_OvenSite'
const OVEN_IDS = ['Major_ClayOven', 'Major_StoneOven'] as const

/**
 * A27 Oven Site (MinorImprovement).
 * BGA (A27_OvenSite.php): When you play this card, you get 2 WOOD and you can
 * immediately build Clay Oven or Stone Oven major improvement. Either way,
 * it only costs you 1 CLAY and 1 STONE.
 * Prerequisite: Both Fireplace (any variant, incl. A60) and Cooking Hearth.
 *
 * BGA implementation:
 *   - onBuy → flag card, gain 2 wood, optional build (Major_ClayOven/StoneOven), unflag
 *   - onPlayerComputeCardCosts: if flagged AND target is ClayOven/StoneOven,
 *     overrides each trade to { stone: 1, clay: 1 }.
 *
 * Here:
 *   - registerCardEffect.onBuy: gains 2 wood, then optional improvement-any with
 *     allowedPurchases restricted to Clay/Stone Oven and sourceCard = CARD_ID.
 *   - computeCosts listener on improvement-any keyed off context.actionCardId === CARD_ID
 *     and context.cardId in Clay/Stone Oven — returns override to zero out standard
 *     costs and add { clay: 1, stone: 1 } (base costs are ClayOven 3clay+1stone or
 *     StoneOven 1clay+3stone, so we apply a delta that results in exactly 1+1).
 */

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq',
    children: [
      gainLeaf(CARD_ID, { wood: 2 }),
      {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          allowedPurchases: [...OVEN_IDS],
        } as any,
      },
    ],
  }),
})

const computeCostsListener: CardListenerRegistration = {
  id: 'A27-oven-site-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionCardId !== CARD_ID) return
    if (!context.cardId) return
    if (!OVEN_IDS.includes(context.cardId as (typeof OVEN_IDS)[number])) return

    // Override base cost to exactly { clay: 1, stone: 1 }.
    // Base costs: ClayOven = { clay: 3, stone: 1 }, StoneOven = { clay: 1, stone: 3 }.
    // Delta makes both become clay:1, stone:1.
    if (context.cardId === 'Major_ClayOven') {
      // 3 clay + 1 stone → 1 clay + 1 stone
      return { costs: { clay: -2 } }
    }
    if (context.cardId === 'Major_StoneOven') {
      // 1 clay + 3 stone → 1 clay + 1 stone
      return { costs: { stone: -2 } }
    }
  },
}

registerCardListener(computeCostsListener)

export const A27_OvenSite = new MinorImprovement({
  id: CARD_ID,
  name: 'Oven Site',
  deck: 'A',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you get 2 <WOOD> and you can immediately build the __Clay Oven__ or __Stone Oven__ major improvement. Either way, it only costs you 1 <CLAY> and 1 <STONE>.',
  ],
  prerequisite: 'Both Fireplace and Cooking Hearth',
  cost: {},
  newSet: true,
})
