import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B111_Rustic } from '../../cards-display/B/B111_Rustic'

const CARD_ID = B111_Rustic.id

const listener: CardListenerRegistration = {
  id: 'B111-rustic-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'clay') return
    const roomsBuilt = getRoomsBuiltThisAction(context.player)
    if (roomsBuilt <= 0) return
    const bonusVpLeaves: ActionFlow[] = Array.from({ length: roomsBuilt }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }))
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { food: 2 * roomsBuilt }),
          ...bonusVpLeaves,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B111_Rustic_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
