import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getPrintedImprovementResourceCost } from '../../actions/helpers/improvement-helpers'
import type { CardImpl } from '../registry'
import { D117_WoodExpert } from '../../cards-display/D/D117_WoodExpert'

const CARD_ID = D117_WoodExpert.id

/**
 * D117 Wood Expert — Occupation.
 * When you play this card, you immediately get 2 wood.
 * Each improvement costs you up to 2 wood less, if you pay 1 food instead.
 *
 * BGA: onBuy → gain 2 wood.
 * onPlayerComputeCardCosts → for major/minor improvements with wood in cost,
 *   adds an alternative trade: -2 wood (capped to actual wood cost) +1 food.
 *
 * Simplified: When an improvement being bought has wood in its cost,
 * apply { wood: -2, food: 1 } discount.
 */

const computeCostsListener: CardListenerRegistration = {
  id: 'D117-wood-expert-compute-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.cardId) return
    const woodInCost = getPrintedImprovementResourceCost(context.cardId, 'wood')
    if (woodInCost <= 0) return
    return {
      trades: [
        {
          from: { food: 1 },
          to: { wood: 2 },
          max: 1,
          source: CARD_ID,
          sourceId: CARD_ID,
        },
      ],
    }
  },
}

export const D117_WoodExpert_impl = {
  listeners: [computeCostsListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 2 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
