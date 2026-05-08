import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A158_CulinaryArtist } from '../../cards-display/A/A158_CulinaryArtist'
export { A158_CulinaryArtist }

const CARD_ID = A158_CulinaryArtist.id

/**
 * A158 Culinary Artist:
 * Each time another player uses the Traveling Players accumulation space,
 * you can optionally exchange 1 grain -> 4 food, 1 sheep -> 5 food,
 * or 1 vegetable -> 7 food. XOR choice.
 * Players 3+.
 */
const listener: CardListenerRegistration = {
  id: 'A158-culinary-artist-opponent-traveling-players',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          {
            type: 'seq',
            children: [
              payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
              gainLeaf(CARD_ID, { food: 4 }),
            ],
          },
          {
            type: 'seq',
            children: [
              payLeaf({ cardId: CARD_ID, cost: { sheep: 1 } }),
              gainLeaf(CARD_ID, { food: 5 }),
            ],
          },
          {
            type: 'seq',
            children: [
              payLeaf({ cardId: CARD_ID, cost: { vegetable: 1 } }),
              gainLeaf(CARD_ID, { food: 7 }),
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A158_CulinaryArtist_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
