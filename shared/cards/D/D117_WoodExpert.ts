import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getMinorImprovementCard } from '../catalog'
import { getMajorCardEffect } from '../major'
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
 *
 * Simplified: When an improvement being bought has wood in its cost,
 * apply { wood: -2, food: 1 } discount.
 */

const getImprovementWoodCost = (cardId: string): number => {
  const minor = getMinorImprovementCard(cardId)
  if (minor) {
    return minor.cost?.wood ?? 0
  }
  const major = getMajorCardEffect(cardId)
  if (major) {
    const costs = Array.isArray(major.cost) ? major.cost : [major.cost ?? {}]
    return costs.reduce((m, c) => Math.max(m, (c as Record<string, number>).wood ?? 0), 0)
  }
  return 0
}

const computeCostsListener: CardListenerRegistration = {
  id: 'D117-wood-expert-compute-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.cardId) return
    const woodInCost = getImprovementWoodCost(context.cardId)
    if (woodInCost <= 0) return
    // Substitute up to 2 wood for 1 food
    const woodDiscount = Math.min(woodInCost, 2)
    return { costs: { wood: -woodDiscount, food: 1 } }
  },
}

export const D117_WoodExpert = new Occupation({
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
})

export const D117_WoodExpert_impl = {
  listeners: [computeCostsListener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
