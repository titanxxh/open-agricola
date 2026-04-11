import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D152_Patron'

const beforeListener: CardListenerRegistration = {
  id: 'D152-patron-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D152-patron-isdoable-occupation',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { doable: true }
  },
}

registerCardListener(beforeListener)
registerCardListener(isDoableListener)

export const D152_Patron = new Occupation({
  id: CARD_ID,
  name: "Patron",
  deck: "D",
  number: 152,
  category: "FOOD_PROVIDER",
  desc: ["Each time before you play an occupation, you get 2 <FOOD>."],
  cost: {},
  players: "4+",
})
