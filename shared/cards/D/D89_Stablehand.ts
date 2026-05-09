import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { D89_Stablehand } from '../../cards-display/D/D89_Stablehand'

const CARD_ID = D89_Stablehand.id

const listener: CardListenerRegistration = {
  id: 'D89-stablehand-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Check that at least 1 fence was built via result
    const newPastures =
      context.result?.type === 'ok'
        ? (context.result.extraData?.newPastures as unknown[] | undefined)
        : undefined
    if (!newPastures || newPastures.length === 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, costs: { max: 1 }, trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D89_Stablehand_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
