import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D158_BeanCounter'

/**
 * Each time you use an action space on round spaces 1 to 8,
 * place 1 food on this card. When it reaches 3, gain them.
 */
const listener: CardListenerRegistration = {
  id: 'D158-bean-counter-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roundAvailable = context.space?.roundAvailable ?? 99
    if (roundAvailable > 8) return

    const current = ((context.player.cardStates?.[CARD_ID]?.counters?.food ?? 0) as number) + 1

    if (current >= 3) {
      return {
        flow: {
          type: 'seq',
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: { kind: 'set-counter', key: 'food', value: 0 },
            },
            gainLeaf(CARD_ID, { food: 3 }),
          ],
        },
        sourceCard: CARD_ID,
      }
    }
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-counter', key: 'food', value: current },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D158_BeanCounter_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
