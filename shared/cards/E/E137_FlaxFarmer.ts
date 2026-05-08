import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E137_FlaxFarmer } from '../../cards-display/E/E137_FlaxFarmer'
export { E137_FlaxFarmer }

const CARD_ID = E137_FlaxFarmer.id

const listener: CardListenerRegistration = {
  id: 'E137-flax-farmer-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId === 'reed-bank') {
      return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    }
    if (spaceId === 'grain-seeds') {
      return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
    }
  },
}

export const E137_FlaxFarmer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
