import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getPlayerBakeRates } from '../helpers/exchange-registry'
import type { CardImpl } from '../registry'
import { E67_GrainBag } from '../../cards-display/E/E67_GrainBag'
export { E67_GrainBag }

const CARD_ID = E67_GrainBag.id

const listener: CardListenerRegistration = {
  id: 'E67-grain-bag-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    const bakeRates = getPlayerBakeRates(context.player)
    const bakeCount = bakeRates.length
    if (bakeCount <= 0) return
    return { flow: gainLeaf(CARD_ID, { grain: bakeCount }), sourceCard: CARD_ID }
  },
}

export const E67_GrainBag_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
