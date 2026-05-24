import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E163_Patroness } from '../../cards-display/E/E163_Patroness'

const CARD_ID = E163_Patroness.id

const listener: CardListenerRegistration = {
  id: 'E163-patroness-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Do not trigger for this card itself
    if (context.choice === CARD_ID) return
    return {
      flow: {
        type: 'xor',
        children: [
          gainLeaf(CARD_ID, { wood: 1 }),
          gainLeaf(CARD_ID, { clay: 1 }),
          gainLeaf(CARD_ID, { reed: 1 }),
          gainLeaf(CARD_ID, { stone: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E163_Patroness_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
