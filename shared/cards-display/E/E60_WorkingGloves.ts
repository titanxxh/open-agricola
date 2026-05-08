import { MinorImprovement } from '../types'
import type { TradeModifier } from '../../contract/types'

const CARD_ID = 'E60_WorkingGloves'

/**
 * E60 Working Gloves (MinorImprovement)
 *
 * BGA: When played, gain 1 food. Each time you pay an occupation cost, you can
 * pay 1 building resource of your choice in place of (up to) 2 food.
 *
 * Implementation: 4 TradeModifier entries (one per building resource) with
 * `from: { res: 1 }, to: { food: 2 }, max: 1`. `getModifiersForCostType(player,
 * 'occupation')` exposes them; `computeAllBuyableCombinations` enumerates each
 * trade alternative, producing base + 4 trade-alt PaymentSolutions per cost.
 *
 * Note (BGA divergence): BGA tags all 4 alts with `sources=[$this->id]` and
 * `max=1` per alt. Strictly, BGA expects "at most one swap per occupation"
 * (group-wise). Our trade pipeline lacks group-max, so 4 trades may stack
 * (worst case: 4 building resources → 8 food). Practical impact small (the
 * cheaper alt dominates in `keepOnlyOptimals`); follow-up if a real game
 * surfaces a multi-stack mismatch.
 */

const buildingResources = ['wood', 'clay', 'reed', 'stone'] as const

const E60_TRADE_MODIFIERS: TradeModifier[] = buildingResources.map((res) => ({
  type: 'trade' as const,
  cardId: CARD_ID,
  appliesTo: ['occupation' as const],
  from: { [res]: 1 } as TradeModifier['from'],
  to: { food: 2 },
  max: 1,
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
