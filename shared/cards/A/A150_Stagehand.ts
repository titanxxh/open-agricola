import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { isTravelingPlayersSpaceId } from '../helpers/action-space-categories'

const CARD_ID = 'A150_Stagehand'
const listener: CardListenerRegistration = {
  id: 'A150-stagehand-opponent-traveling-players',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isTravelingPlayersSpaceId(context.space?.id)) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'fence', sourceCard: CARD_ID, actionContext: { trueAction: false } },
          { type: 'leaf', actionId: 'stables', sourceCard: CARD_ID, actionContext: { trueAction: false } },
          { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID, actionContext: { trueAction: false } },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A150_Stagehand = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stagehand',
    deck: 'A',
    number: 150,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each time another player uses the __Traveling Players__ accumulation space, you can take your choice of a __Build Fences__, __Build Stables__, or __Build Rooms__ action.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const A150_Stagehand_impl = A150_Stagehand.impl
