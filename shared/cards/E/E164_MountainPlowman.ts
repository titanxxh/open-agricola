import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E164_MountainPlowman } from '../../cards-display/E/E164_MountainPlowman'
export { E164_MountainPlowman }

const CARD_ID = E164_MountainPlowman.id

const listener: CardListenerRegistration = {
  id: 'E164-mountain-plowman-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { sheep: 1 }), sourceCard: CARD_ID }
  },
}

export const E164_MountainPlowman_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
