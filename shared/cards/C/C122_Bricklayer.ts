import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { BonusModifier } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C122_Bricklayer'

/**
 * C122 Bricklayer — Each improvement and each renovation cost you 1 clay less.
 * Each room costs you 2 clay less.
 *
 * BGA reference: onPlayerComputeCardCosts (improvements -1 clay),
 * onPlayerComputeCostsConstruct (rooms -2 clay),
 * onPlayerComputeCostsRenovation (-1 clay).
 */

const improvementCostListener: CardListenerRegistration = {
  id: 'C122-bricklayer-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { clay: -1 } }
  },
}

export const C122_Bricklayer = new Occupation({
  id: CARD_ID,
  name: 'Bricklayer',
  deck: 'C',
  number: 122,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each improvement and each renovation cost you 1 <CLAY> less. Each room costs you 2 <CLAY> less.'],
  cost: {},
  players: '1+',
  modifiers: [
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { clay: 2 },
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      discount: { clay: 1 },
    },
  ] as BonusModifier[],
})

export const C122_Bricklayer_impl = {
  listeners: [improvementCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
