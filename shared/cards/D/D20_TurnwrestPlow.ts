import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { D20_TurnwrestPlow } from '../../cards-display/D/D20_TurnwrestPlow'

const CARD_ID = D20_TurnwrestPlow.id

const TRIGGER_SPACES = new Set(['farmland', 'cultivation'])

const listener: CardListenerRegistration = {
  id: 'D20-turnwrest-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !TRIGGER_SPACES.has(context.space.id)) return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return

    if (stack.length >= 2) {
      // 2 fields remaining — offer up to 2 plows
      return {
        flow: {
          type: 'seq',
          optional: true,
          children: [
            { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
            {
              type: 'seq',
              optional: true,
              children: [
                { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
                { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
              ],
            },
          ],
        },
        sourceCard: CARD_ID,
      }
    } else {
      // 1 field remaining — offer 1 plow
      return {
        flow: {
          type: 'seq',
          optional: true,
          children: [
            { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
          ],
        },
        sourceCard: CARD_ID,
      }
    }
  },
}

export const D20_TurnwrestPlow_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['field', 'field'])
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
