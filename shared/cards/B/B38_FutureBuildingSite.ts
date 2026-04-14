import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode, removeFutureMeeples } from '../../actions/effects/future-meeples'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'

const CARD_ID = 'B38_FutureBuildingSite'

/**
 * B38 Future Building Site (MinorImprovement, B, 38)
 * Place 1 wood on each of the next 4 round spaces. At the start of these rounds, you get the wood.
 * Remove promised wood when you build a room.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 4,
      resources: { wood: 1 },
    })
    return futureMeeplesNode()
  },
})

const afterConstructListener: CardListenerRegistration = {
  id: 'B38-future-building-site-after-construct',
  cardIds: [CARD_ID],
  actions: ['construct'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    removeFutureMeeples(context.state, {
      playerId: context.player.id,
      cardId: CARD_ID,
    })
    setCardFlag(context.player, CARD_ID, true)
  },
}

registerCardListener(afterConstructListener)

export const B38_FutureBuildingSite = new MinorImprovement({
  id: CARD_ID,
  name: 'Future Building Site',
  deck: 'B',
  number: 38,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <WOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <WOOD>. Remove the <WOOD> promised by this card from future round spaces the next time you build a room.'],
  cost: {},
  implemented: true,
})
