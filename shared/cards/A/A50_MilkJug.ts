import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A50_MilkJug'
/**
 * A50 Milk Jug — Each time any player (including you) uses the Cattle Market
 * accumulation space, you get 3 food and each other player gets 1 food.
 *
 * BGA reference: A_50_MilkJug.php
 * scope 'any' — fires once for the card owner regardless of who triggered.
 */
const listener: CardListenerRegistration = {
  id: 'A50-milk-jug-any-cattle-market',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'cattle-market') return
    // Owner always gets 3 food; every other player gets 1 food.
    // The flow executes in the context of the owner (PlayerSwitch handles this).
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { food: 3 }),
          {
            type: 'leaf',
            actionId: 'gain',
            params: { recipientMode: 'others', food: 1 },
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A50_MilkJug = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Milk Jug",
    deck: "A",
    number: 50,
    category: "FOOD_PROVIDER",
    desc: [
        "Each time any player (including you) uses the __Cattle Market__ accumulation space, you get 3 <FOOD>, and each other player gets 1 <FOOD>.",
      ],
    cost: { clay: 1 },
  },
  impl: cardImpl,
})

export const A50_MilkJug_impl = A50_MilkJug.impl
