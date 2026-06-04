import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'D87_MasterBuilder'
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

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D87_MasterBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Builder',
    deck: 'D',
    number: 87,
    category: 'FARM_PLANNER',
    desc: ['Once your house has at least 5 rooms, at any time, but only once this game, you can add another room at no cost.'],
    cost: {},
    players: '1+',
    implemented: true,
  },
  impl: cardImpl,
})

export const D87_MasterBuilder_impl = D87_MasterBuilder.impl
