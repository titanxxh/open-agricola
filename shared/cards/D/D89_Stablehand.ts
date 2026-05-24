import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { DraftGameEvent, FarmFenceBuiltEvent } from '../../contract/events'
import type { CardImpl } from '../registry'
import { D89_Stablehand } from '../../cards-display/D/D89_Stablehand'

const CARD_ID = D89_Stablehand.id

type QueryableFarmFenceBuiltEvent = FarmFenceBuiltEvent | DraftGameEvent<'farm.fenceBuilt'>

const isFarmFenceBuiltEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableFarmFenceBuiltEvent =>
  event.type === 'farm.fenceBuilt'

const hasNewPasture = (context: CardListenerContext): boolean => {
  const events = context.actionEvents ?? context.transactionEvents
  return (events ?? []).some((event) =>
    isFarmFenceBuiltEvent(event) && (event.newPastures?.length ?? 0) > 0,
  )
}

const listener: CardListenerRegistration = {
  id: 'D89-stablehand-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasNewPasture(context)) return
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

export const D89_Stablehand_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
