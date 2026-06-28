import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B075_WoodWorkshop'
const beforeListener: CardListenerRegistration = {
  id: 'B75-wood-workshop-before-improvement',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['improvement'],
  dispatchMode: 'select',
  mandatory: true,
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B75-wood-workshop-isdoable-improvement',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['improvement'],
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

export const B075_WoodWorkshop = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wood Workshop",
    deck: "B",
    number: 75,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Each time before you play or build an improvement, you get 1 <WOOD>."],
    cost: {"clay":1},
    prerequisite: "1 Occupation",
    occupationPrerequisites: {"min":1},
  },
  impl: cardImpl,
})

export const B075_WoodWorkshop_impl = B075_WoodWorkshop.impl
