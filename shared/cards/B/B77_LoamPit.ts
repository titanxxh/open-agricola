import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B77_LoamPit } from '../../cards-display/B/B77_LoamPit'

const CARD_ID = B77_LoamPit.id

const listener: CardListenerRegistration = {
  id: 'B77-loam-pit-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return { flow: gainLeaf(CARD_ID, { clay: 3 }), sourceCard: CARD_ID }
  },
}

export const B77_LoamPit_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
