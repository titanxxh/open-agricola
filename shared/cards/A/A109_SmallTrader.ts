import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A109_SmallTrader } from '../../cards-display/A/A109_SmallTrader'
export { A109_SmallTrader }

const CARD_ID = A109_SmallTrader.id

const listener: CardListenerRegistration = {
  id: 'A109-small-trader-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice
    if (!choice || !choice.startsWith('minor:')) return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

export const A109_SmallTrader_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
