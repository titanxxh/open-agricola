import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D49_Bookshelf'
const beforeListener: CardListenerRegistration = {
  id: 'D49-bookshelf-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D49-bookshelf-isdoable-occupation',
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

export const D49_Bookshelf = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Bookshelf",
    deck: "D",
    number: 49,
    category: "FOOD_PROVIDER",
    desc: ['Immediately before each time you play an occupation (even before paying the occupation cost), you get 3 <FOOD>.'],
    cost: { wood: 1 },
    vp: 1,
    prerequisite: "3 Occupations",
    occupationPrerequisites: { min: 3 },
    players: "1+",
  },
  impl: cardImpl,
})

export const D49_Bookshelf_impl = D49_Bookshelf.impl
