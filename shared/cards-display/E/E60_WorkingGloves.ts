import { MinorImprovement } from '../types'
import type { TradeModifier } from '../../contract/types'

const CARD_ID = 'E60_WorkingGloves'
const GROUP_ID = `${CARD_ID}:occupation-food-replacement`

/**
 * E60 Working Gloves (MinorImprovement)
 *
 * BGA: When played, gain 1 food. Each time you pay an occupation cost, you can
 * pay 1 building resource of your choice in place of (up to) 2 food.
 *
 * Implementation: 4 TradeModifier entries (one per building resource) sharing
 * one group cap, so payment enumeration offers all four alternatives while
 * allowing at most one replacement per occupation payment.
 */

const buildingResources = ['wood', 'clay', 'reed', 'stone'] as const

const E60_TRADE_MODIFIERS: TradeModifier[] = buildingResources.map((res) => ({
  type: 'trade' as const,
  cardId: CARD_ID,
  appliesTo: ['occupation' as const],
  from: { [res]: 1 } as TradeModifier['from'],
  to: { food: 2 },
  max: 1,
  groupId: GROUP_ID,
  groupMax: 1,
}))

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
  modifiers: E60_TRADE_MODIFIERS,
})
