import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'

const CARD_ID = 'A21_FamilyFriendHome'

// A21 Family Friendly Home: Each time you take a Build Rooms action while having more rooms
// than people already, you also get a Family Growth action and 1 food.
// BGA checks: isActionEvent($event, 'Construct', 'player')
// and then: $oldRoomCount > $farmers && $farmers < 5 && $event['trueAction']
// $oldRoomCount = rooms before action, $farmers = current family size
const listener: CardListenerRegistration = {
  id: 'A21-family-friendly-home-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.trueAction === false) return
    const roomsBuilt = getRoomsBuiltThisAction(context.player)
    if (roomsBuilt <= 0) return
    // Rooms before action = current rooms - rooms built
    const oldRoomCount = context.player.rooms - roomsBuilt
    const familySize = context.player.familySize
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

registerCardListener(listener)

export const A21_FamilyFriendHome = new MinorImprovement({
  id: CARD_ID,
  name: 'Family Friendly Home',
  deck: 'A',
  number: 21,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you take a __Build Rooms__ action while having more rooms than people already, you also get a __Family Growth__ action and 1 <FOOD>.'],
  cost: {},
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})
