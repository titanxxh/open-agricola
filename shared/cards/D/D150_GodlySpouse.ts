import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import type { CardImpl } from '../registry'

const CARD_ID = 'D150_GodlySpouse'

const afterWishChildrenListener: CardListenerRegistration = {
  id: 'D150-godly-spouse-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (getRoundPlacementOrder(context.player).length !== 2) return

    return {
      flow: {
        type: 'leaf',
        actionId: 'return-first-worker-home',
        sourceCard: CARD_ID,
        params: {
          flagSourceCard: true,
          logCardTrigger: true,
        },
        optional: true,
        promptKey: 'ui.interactionGodlySpouse',
        choiceLabelKey: 'ui.interactionGodlySpouseUse',
      },
    }
  },
}

export const D150_GodlySpouse = new Occupation({
  id: CARD_ID,
  name: "Godly Spouse",
  deck: "D",
  number: 150,
  category: "ACTIONS_BOOSTER",
  desc: [
    'Each time you take a __Family Growth__ action with the second person you place in a round, return the first person you placed home, unless it is on the __Meeting Place__ action space.',
  ],
  cost: {},
  players: "4+",
})

export const D150_GodlySpouse_impl = {
  listeners: [afterWishChildrenListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, _player) => {
    return { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
