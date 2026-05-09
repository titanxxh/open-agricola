import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'
import { D123_RenovationPreparer } from '../../cards-display/D/D123_RenovationPreparer'

const CARD_ID = D123_RenovationPreparer.id

const listener: CardListenerRegistration = {
  id: 'D123-renovation-preparer-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roomsBuilt = getRoomsBuiltThisAction(context.player)
    if (roomsBuilt <= 0) return
    const houseType = context.player.houseType
    if (houseType === 'wood') {
      return { flow: gainLeaf(CARD_ID, { clay: 2 * roomsBuilt }), sourceCard: CARD_ID }
    } else if (houseType === 'clay') {
      return { flow: gainLeaf(CARD_ID, { stone: 2 * roomsBuilt }), sourceCard: CARD_ID }
    }
  },
}

export const D123_RenovationPreparer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
