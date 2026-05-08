import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E66_BarnShed } from '../../cards-display/E/E66_BarnShed'
export { E66_BarnShed }

const CARD_ID = E66_BarnShed.id

/**
 * E66 Barn Shed — Each time another player uses the Forest accumulation space,
 * card owner gets 1 grain.
 *
 * BGA reference: E_66_BarnShed.php
 * scope 'opponent' — fires when an opponent uses Forest, owner gains 1 grain.
 */
const listener: CardListenerRegistration = {
  id: 'E66-barn-shed-opponent-forest',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'forest') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const E66_BarnShed_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
