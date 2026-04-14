import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { BonusModifier } from '../../game/types'

const CARD_ID = 'A143_Stonecutter'

/**
 * A143 Stonecutter — Every improvement, room, and renovation costs you 1 stone less.
 *
 * BGA reference: onPlayerComputeCardCosts (improvements), onPlayerComputeCostsConstruct,
 * onPlayerComputeCostsRenovation.
 *
 * For construct and renovation we use BonusModifier (the modifier system).
 * For improvements (majors/minors) we use a computeCosts listener on improvement-any.
 */

const improvementCostListener: CardListenerRegistration = {
  id: 'A143-stonecutter-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { costs: { stone: -1 } }
  },
}

registerCardListener(improvementCostListener)

export const A143_Stonecutter = new Occupation({
  id: CARD_ID,
  name: 'Stonecutter',
  deck: 'A',
  number: 143,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Every improvement, room, and renovation costs you 1 <STONE> less.'],
  cost: {},
  players: '3+',
  modifiers: [
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { stone: 1 },
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      discount: { stone: 1 },
    },
  ] as BonusModifier[],
})
