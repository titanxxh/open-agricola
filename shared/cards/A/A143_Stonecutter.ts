import { defineOccupationCard } from '../card-source'
import type { BonusModifier } from '../../contract/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

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
  actions: ['improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { stone: -1 } }
  },
}

const cardImpl = {
  listeners: [improvementCostListener],
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
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A143_Stonecutter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stonecutter',
    deck: 'A',
    number: 143,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Every improvement, room, and renovation costs you 1 <STONE> less.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A143_Stonecutter_impl = A143_Stonecutter.impl
