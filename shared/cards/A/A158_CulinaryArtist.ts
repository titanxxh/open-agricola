import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { isTravelingPlayersSpaceId } from '../helpers/action-space-categories'

const CARD_ID = 'A158_CulinaryArtist'
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
  actionSpaces: 'all',
  phases: ['after'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isTravelingPlayersSpaceId(context.space?.id)) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: ([['grain', 4], ['sheep', 5], ['vegetable', 7]] as const).map(([resource, food]) => ({
          type: 'leaf',
          actionId: 'exchange',
          sourceCard: CARD_ID,
          actionContext: {
            directTrade: { from: { [resource]: 1 }, to: { food }, sourceId: CARD_ID },
          },
        })),
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A158_CulinaryArtist = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Culinary Artist',
    deck: 'A',
    number: 158,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each time another player uses the __Traveling Players__ accumulation space, you can exchange your choice of 1 <GRAIN>/<SHEEP>/<VEGETABLE> for 4/5/7 <FOOD>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const A158_CulinaryArtist_impl = A158_CulinaryArtist.impl
