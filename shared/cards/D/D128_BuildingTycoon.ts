import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'
import { D128_BuildingTycoon } from '../../cards-display/D/D128_BuildingTycoon'

const CARD_ID = D128_BuildingTycoon.id

/**
 * D128 Building Tycoon:
 * Each time another player builds 1+ rooms, you can pay them 1 food
 * to then build 1 room at full building cost.
 * Players 4+.
 *
 * Trigger: opponent's construct action completes (after phase).
 * We detect room building by checking rooms built this action via snapshot.
 */
const listener: CardListenerRegistration = {
  id: 'D128-building-tycoon-opponent-construct',
  cardIds: [CARD_ID],
  actions: ['construct'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Check the opponent actually built rooms
    const triggerPlayer = context.triggerPlayer ?? context.player
    const roomsBuilt = getRoomsBuiltThisAction(triggerPlayer)
    if (roomsBuilt <= 0) return
    const triggerPlayerId = triggerPlayer.id
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'pay',
            params: { food: 1 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'gain',
            params: { food: 1, recipientPlayerId: triggerPlayerId },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'construct',
            sourceCard: CARD_ID,
            actionContext: { maxRooms: 1, trueAction: false },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D128_BuildingTycoon_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
