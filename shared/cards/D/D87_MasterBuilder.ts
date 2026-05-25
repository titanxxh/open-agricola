import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { D87_MasterBuilder } from '../../cards-display/D/D87_MasterBuilder'

const CARD_ID = D87_MasterBuilder.id
const FREE_SINGLE_ROOM_CONTEXT = {
  maxRooms: 1,
  exactCost: { max: 1 },
  trueAction: false,
  cancelPolicy: 'forbidCancel',
}

const anytimeListener: CardListenerRegistration = {
  id: 'D87-master-builder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.rooms < 5) return
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'construct',
            sourceCard: CARD_ID,
            actionContext: FREE_SINGLE_ROOM_CONTEXT,
          },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D87_MasterBuilder.anytime',
    }
  },
}

export const D87_MasterBuilder_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
