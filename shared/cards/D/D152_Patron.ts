import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D152_Patron'
const beforeListener: CardListenerRegistration = {
  id: 'D152-patron-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D152-patron-isdoable-occupation',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [beforeListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D152_Patron = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Patron",
    deck: "D",
    number: 152,
    category: "ACTIONS_BOOSTER",
    desc: ['Immediately before each time you play an occupation after this one (even before paying the occupation cost), you get 2 <FOOD>.'],
    cost: {},
    players: "4+",
  },
  impl: cardImpl,
})

export const D152_Patron_impl = D152_Patron.impl
