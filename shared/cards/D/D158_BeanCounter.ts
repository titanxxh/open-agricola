import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundActionSlot } from '../helpers/round-action-topology'
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
    const slot = context.space ? getRoundActionSlot(context.state, context.space.id) : null
    if (!slot || slot.roundNumber > 8) return

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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D158_BeanCounter = defineOccupationCard({
  meta: {
    id: "D158_BeanCounter",
    name: "Bean Counter",
    deck: "D",
    number: 158,
    category: "FOOD_PROVIDER",
    desc: [
        'Each time you use an action space on round spaces 1 to 8, place 1 <FOOD> on this card. Each time this card has 3 <FOOD> on it, move the <FOOD> to your supply.',
      ],
    cost: {},
    players: "4+",
  },
  impl: cardImpl,
})

export const D158_BeanCounter_impl = D158_BeanCounter.impl
