import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C149_ResourceRecycler'

/**
 * C149 Resource Recycler:
 * Each time another player renovates to stone, you can pay 2 food to
 * build 1 clay room for free. You must currently have a clay house.
 * Players 4+.
 *
 * The trigger fires after any opponent renovate-house. We check that the
 * opponent now has a stone house (meaning they just renovated to stone)
 * and that the card owner has a clay house.
 */
const listener: CardListenerRegistration = {
  id: 'C149-resource-recycler-opponent-renovate-stone',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // The trigger player just renovated — check they reached stone
    const triggerPlayer = context.triggerPlayer ?? context.player
    if (triggerPlayer.houseType !== 'stone') return
    // The card owner must have a clay house
    const owner = context.ownerPlayer
    if (!owner || owner.houseType !== 'clay') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          {
            type: 'leaf',
            actionId: 'construct',
            sourceCard: CARD_ID,
            actionContext: { maxRooms: 1, costOverride: { wood: -99, clay: -99, reed: -99, stone: -99 }, trueAction: false },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C149_ResourceRecycler = new Occupation({
  id: CARD_ID,
  name: 'Resource Recycler',
  deck: 'C',
  number: 149,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time another player renovates to stone, you can pay 2 <FOOD> to build 1 clay room for free. You must currently have a clay house.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
