import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'E130_Overachiever'

const DISCOUNT_RESOURCES = [
  'wood', 'clay', 'stone', 'reed', 'food', 'grain', 'vegetable',
  'sheep', 'boar', 'cattle',
] as const

const beforeWishChildrenListener: CardListenerRegistration = {
  id: 'E130-overachiever-before-wish-children',
  cardIds: [CARD_ID],
  phases: ['before'],
  actions: ['wish-children-growth'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: { type: 'leaf', actionId: 'improvement-any', optional: true, promptKey: 'ui.interactionOverachieverImprovement', sourceCard: CARD_ID },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'improvement-any' },
      sourceCard: CARD_ID,
    }
  },
}

const computeCostsListener: CardListenerRegistration = {
  id: 'E130-overachiever-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts'],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionCardId !== CARD_ID) return
    return {
      bonuses: DISCOUNT_RESOURCES.map((res) => ({
        discount: { [res]: 1 },
        optional: true,
        sources: [CARD_ID],
      })),
    }
  },
}

export const E130_Overachiever = new Occupation({
  id: CARD_ID,
  name: "Overachiever",
  deck: "E",
  number: 130,
  category: "ACTIONS_BOOSTER",
  desc: ['Each time you use a __Wish for Children__ action space, you can play 1 additional improvement by paying its cost minus 1 resource of your choice.'],
  cost: {},
  players: "3+",
})

export const E130_Overachiever_impl = {
  listeners: [beforeWishChildrenListener, computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
