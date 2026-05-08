import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C73_SeaweedFertilizer } from '../../cards-display/C/C73_SeaweedFertilizer'
export { C73_SeaweedFertilizer }

const CARD_ID = C73_SeaweedFertilizer.id

const isUnconditionalSow = (context: CardListenerContext): boolean => {
  const actionContext = context.actionContext ?? {}
  if (actionContext.checkedReplaceAction === true) return false
  return actionContext.maxSelections === undefined && actionContext.cropType === undefined
}

const listener: CardListenerRegistration = {
  id: 'C73-seaweed-fertilizer-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context)) return
    if (context.state.round < 11) {
      return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    } else {
      return {
        flow: {
          type: 'xor',
          children: [
            gainLeaf(CARD_ID, { grain: 1 }),
            gainLeaf(CARD_ID, { vegetable: 1 }),
          ],
        },
        sourceCard: CARD_ID,
      }
    }
  },
}

export const C73_SeaweedFertilizer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
