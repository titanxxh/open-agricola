import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A55_JunkRoom'

const listener: CardListenerRegistration = {
  id: 'A55-junk-room-during-improvement',
  cardIds: [CARD_ID],
  phases: ['during' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

export const A55_JunkRoom = new MinorImprovement({
  id: CARD_ID,
  name: "Junk Room",
  deck: "A",
  number: 55,
  category: "FOOD_PROVIDER",
  desc: ["Each time after you build an improvement, including this one, you get 1 <FOOD>."],
  cost: {"wood":1,"clay":1},
})

export const A55_JunkRoom_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
