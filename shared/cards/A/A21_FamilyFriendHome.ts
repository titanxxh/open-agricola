import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import { familySize as getFamilySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { A21_FamilyFriendHome } from '../../cards-display/A/A21_FamilyFriendHome'

const CARD_ID = A21_FamilyFriendHome.id

const listener: CardListenerRegistration = {
  id: 'A21-family-friendly-home-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    const roomsBuilt = getRoomsBuiltThisAction(context.player)
    if (roomsBuilt <= 0) return
    // Rooms before action = current rooms - rooms built
    const oldRoomCount = context.player.rooms - roomsBuilt
    const familySize = getFamilySize(context.player)
    // Only trigger if there were more rooms than people BEFORE building
    if (oldRoomCount <= familySize) return
    if (familySize >= 5) return
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { food: 1 }),
          {
            type: 'leaf',
            actionId: 'wish-children',
            sourceCard: CARD_ID,
            actionContext: { constraints: ['freeRoom'], trueAction: false },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A21_FamilyFriendHome_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
