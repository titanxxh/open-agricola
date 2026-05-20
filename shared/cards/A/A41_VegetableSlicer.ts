import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { DraftGameEvent, GameEvent } from '../../contract/events'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A41_VegetableSlicer } from '../../cards-display/A/A41_VegetableSlicer'

const CARD_ID = A41_VegetableSlicer.id

const COOKING_HEARTH_IDS = new Set(['Major_CookingHearth1', 'Major_CookingHearth2'])

const FIREPLACE_IDS = new Set(['Major_Fireplace1', 'Major_Fireplace2'])

type QueryableCardPlayedEvent = Extract<GameEvent, { type: 'card.played' }> | DraftGameEvent<'card.played'>
type QueryableResourcePaidEvent = Extract<GameEvent, { type: 'resource.paid' }> | DraftGameEvent<'resource.paid'>

const isCardPlayedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableCardPlayedEvent =>
  event.type === 'card.played'

const isResourcePaidEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableResourcePaidEvent =>
  event.type === 'resource.paid'

const playedImprovementId = (context: CardListenerContext): string | undefined => {
  const events = context.actionEvents ?? context.transactionEvents
  for (const event of events ?? []) {
    if (isCardPlayedEvent(event) && event.cardType === 'major') {
      return event.cardId
    }
  }
  return typeof context.choice === 'string' ? context.choice.replace(/^major:/, '') : undefined
}

const paidReturnedFireplace = (context: CardListenerContext): boolean => {
  const events = context.actionEvents ?? context.transactionEvents
  return (events ?? []).some((event) =>
    isResourcePaidEvent(event) && FIREPLACE_IDS.has(event.returnedCardId ?? ''),
  )
}

const listener: CardListenerRegistration = {
  id: 'A41-vegetable-slicer-after-improvement',
  cardIds: [CARD_ID],
  actions: ['improvement'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!COOKING_HEARTH_IDS.has(playedImprovementId(context) ?? '')) return
    if (!paidReturnedFireplace(context)) return

    return {
      flow: gainLeaf(CARD_ID, { wood: 2, vegetable: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

export const A41_VegetableSlicer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
