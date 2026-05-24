import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { DraftGameEvent, GameEvent } from '../../contract/events'
import type { CardImpl } from '../registry'
import { E89_Stallwright } from '../../cards-display/E/E89_Stallwright'

const CARD_ID = E89_Stallwright.id

const TRIGGER_COUNTS = new Set([2, 3, 5, 7])
const BENEFICIARY_ID = 'E97_Beneficiary'

type QueryableCardPlayedEvent = Extract<GameEvent, { type: 'card.played' }> | DraftGameEvent<'card.played'>

const isCardPlayedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableCardPlayedEvent =>
  event.type === 'card.played'

const beneficiaryHandlesThirdOccupationStable = (context: CardListenerContext) =>
  context.player.occupationPlayed.length === 3 &&
  (context.actionEvents ?? context.transactionEvents).some((event) =>
    isCardPlayedEvent(event) &&
    event.cardId === BENEFICIARY_ID &&
    event.cardType === 'occupation',
  )

const listener: CardListenerRegistration = {
  id: 'E89-stallwright-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (beneficiaryHandlesThirdOccupationStable(context)) return
    const n = context.player.occupationPlayed.length
    if (!TRIGGER_COUNTS.has(n)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, exactCost: { max: 1 }, trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E89_Stallwright_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
