import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A15_CarpentersAxe } from '../../cards-display/A/A15_CarpentersAxe'

const CARD_ID = A15_CarpentersAxe.id

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A15-carpenters-axe-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    if ((context.player.resources.wood ?? 0) < 7) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, costOverride: { wood: 1 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A15_CarpentersAxe_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
