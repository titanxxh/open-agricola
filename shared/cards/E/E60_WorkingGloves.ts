import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E60_WorkingGloves'

const computeCostsListener: CardListenerRegistration = {
  id: 'E60-working-gloves-compute-costs-occupation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['occupation', 'play-occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    // Substitute up to 2 food with 1 building resource (simplified: -2 food discount)
    return { costs: { food: -2 } }
  },
}

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

export const E60_WorkingGloves_impl = {
  listeners: [computeCostsListener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { food: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
