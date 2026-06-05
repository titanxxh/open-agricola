import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getPrintedImprovementResourceCost } from '../../actions/helpers/improvement-helpers'
import type { CardImpl } from '../registry'

const CARD_ID = 'D117_WoodExpert'
/**
 * D117 Wood Expert — Occupation.
 * When you play this card, you immediately get 2 wood.
 * Each improvement costs you up to 2 wood less, if you pay 1 food instead.
 *
 * BGA: onBuy → gain 2 wood.
 * onPlayerComputeCardCosts → for major/minor improvements with wood in cost,
 *   adds an alternative trade: -2 wood (capped to actual wood cost) +1 food.
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
      candidateDerivers: [
        {
          id: `${CARD_ID}:wood-expert-cost-deriver`,
          sourceCardId: CARD_ID,
          derive(candidate) {
            const wood = candidate.cost.wood ?? 0
            if (wood <= 0) return []
            const reducedWood = wood - Math.min(2, wood)
            return [{
              cost: {
                ...candidate.cost,
                wood: reducedWood,
                food: (candidate.cost.food ?? 0) + 1,
              },
            }]
          },
        },
      ],
    }
  },
}

const cardImpl = {
  listeners: [computeCostsListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 2 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D117_WoodExpert = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Wood Expert',
    deck: 'D',
    number: 117,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'When you play this card, you immediately get 2 <WOOD>. Each improvement costs you up to 2 <WOOD> less, if you pay 1 <FOOD> instead.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D117_WoodExpert_impl = D117_WoodExpert.impl
