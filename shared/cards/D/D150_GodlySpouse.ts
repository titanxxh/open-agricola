import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { getRoundPlacementOrder } from '../helpers/round-placement'

const CARD_ID = 'D150_GodlySpouse'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    return { type: 'leaf', actionId: 'unflag-card', sourceCard: CARD_ID }
  },
})

const afterWishChildrenListener: CardListenerRegistration = {
  id: 'D150-godly-spouse-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['wish-children-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    if (getRoundPlacementOrder(context.player).length !== 2) return

    return {
      flow: {
        type: 'xor',
        promptKey: 'ui.interactionGodlySpouse',
        children: [
          {
            type: 'leaf',
            actionId: 'return-first-worker-home',
            sourceCard: CARD_ID,
            params: {
              flagSourceCard: true,
              incrementTriggerCount: true,
              logCardTrigger: true,
            },
            choiceLabelKey: 'ui.interactionGodlySpouseUse',
          },
          {
            type: 'leaf',
            actionId: 'noop',
            choiceLabelKey: 'ui.interactionGodlySpouseSkip',
          },
        ],
      },
    }
  },
}

registerCardListener(afterWishChildrenListener)

export const D150_GodlySpouse = new Occupation({
  id: CARD_ID,
  name: "Godly Spouse",
  deck: "D",
  number: 150,
  category: "ACTIONS_BOOSTER",
  desc: ["After you use Wish for Children and have placed a second person this round, you may return your first placed person home (unless on Meeting Place)."],
  cost: {},
  players: "4+",
})
