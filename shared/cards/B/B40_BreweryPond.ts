import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B40_BreweryPond } from '../../cards-display/B/B40_BreweryPond'

const CARD_ID = B40_BreweryPond.id

const listener: CardListenerRegistration = {
  id: 'B40-brewery-pond-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const id = context.space?.id
    if (id !== 'fishing' && id !== 'reed-bank') return
    return { flow: gainLeaf(CARD_ID, { grain: 1, wood: 1 }), sourceCard: CARD_ID }
  },
}

export const B40_BreweryPond_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
