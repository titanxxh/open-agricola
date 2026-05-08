import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A115_ChiefForester } from '../../cards-display/A/A115_ChiefForester'
export { A115_ChiefForester }

const CARD_ID = A115_ChiefForester.id

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A115-chief-forester-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'sow',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1 },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A115_ChiefForester_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
