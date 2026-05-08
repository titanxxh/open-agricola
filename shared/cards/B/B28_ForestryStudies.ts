import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B28_ForestryStudies } from '../../cards-display/B/B28_ForestryStudies'

const CARD_ID = B28_ForestryStudies.id

const listener: CardListenerRegistration = {
  id: 'B28-forestry-studies-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'forest') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { wood: 2 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'play-occupation',
            sourceCard: CARD_ID,
            params: { costOverride: {} },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B28_ForestryStudies_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
