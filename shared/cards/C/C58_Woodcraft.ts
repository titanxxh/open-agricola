import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C58_Woodcraft } from '../../cards-display/C/C58_Woodcraft'

const CARD_ID = C58_Woodcraft.id

const listener: CardListenerRegistration = {
  id: 'C58-woodcraft-immediately-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.wood ?? 0) <= 0) return
    if ((context.player.resources.wood ?? 0) > 5) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

export const C58_Woodcraft_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
