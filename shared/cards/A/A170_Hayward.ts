import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { canStartFencing } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'A170_Hayward'

const anytimeListener: CardListenerRegistration = {
  id: 'A170-hayward-anytime-fence',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canStartFencing(context.state, context.player)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'fence',
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      },
      sourceCard: CARD_ID,
      labelKey: `cards.${CARD_ID}.anytime`,
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A170_Hayward = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Hayward',
    deck: 'A',
    number: 170,
    category: 'FARM_PLANNER',
    desc: ['You can build fences at any time without placing a person. (This is not considered a "Build Fences" action.)'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A170_Hayward_impl = A170_Hayward.impl
