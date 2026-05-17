import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A55_JunkRoom } from '../../cards-display/A/A55_JunkRoom'

const CARD_ID = A55_JunkRoom.id

const listener: CardListenerRegistration = {
  id: 'A55-junk-room-during-improvement',
  cardIds: [CARD_ID],
  phases: ['during' as ActionHookPhase],
  actions: ['improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

export const A55_JunkRoom_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
