import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A77_Hod } from '../../cards-display/A/A77_Hod'

const CARD_ID = A77_Hod.id

const listener: CardListenerRegistration = {
  id: 'A77-hod-any-pig-market',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'pig-market') return
    return { flow: gainLeaf(CARD_ID, { clay: 2 }), sourceCard: CARD_ID }
  },
}

export const A77_Hod_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
