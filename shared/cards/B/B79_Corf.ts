import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B79_Corf } from '../../cards-display/B/B79_Corf'
export { B79_Corf }

const CARD_ID = B79_Corf.id

/**
 * B79 Corf (Minor Improvement):
 * Each time any player (including you) takes at least 3 Stone from an
 * accumulation space, you get 1 Stone from the general supply.
 */

const listener: CardListenerRegistration = {
  id: 'B79-corf-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gained = context.result?.type === 'ok'
      ? (context.result.resourcesGained?.stone ?? 0)
      : 0
    if (gained < 3) return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

export const B79_Corf_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
