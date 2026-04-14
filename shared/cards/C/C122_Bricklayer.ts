import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { BonusModifier } from '../../game/types'

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
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { costs: { clay: -1 } }
  },
}

registerCardListener(improvementCostListener)

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
