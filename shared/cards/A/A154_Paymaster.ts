import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A154_Paymaster'

/**
 * A154 Paymaster:
 * Each time an opponent uses a food accumulation space (Fishing, Traveling Players),
 * the card owner can optionally give the opponent 1 grain to get 1 bonus VP.
 *
 * BGA: isListeningTo → PlaceFarmer on Fishing/TravelingPlayers.
 *      onOpponentAfterPlaceFarmer → optional: pay 1 grain → give to opponent → bonus VP.
 *
 * Uses gain-trigger-player to give grain to the opponent, then bonus-vp for owner.
 */
const FOOD_ACCUMULATION_SPACES = new Set(['fishing', 'traveling-players'])

const listener: CardListenerRegistration = {
  id: 'A154-paymaster-opponent-food-accumulation',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !FOOD_ACCUMULATION_SPACES.has(spaceId)) return

    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          {
            type: 'leaf',
            actionId: 'gain-trigger-player',
            params: { grain: 1, targetPlayerId: triggerPlayerId },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'bonus-vp',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A154_Paymaster = new Occupation({
  id: CARD_ID,
  name: 'Paymaster',
  deck: 'A',
  number: 154,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time another player uses a food accumulation space, you can give them 1 <GRAIN> from your supply to get 1 bonus <SCORE>.',
  ],
  cost: {},
  players: '4+',
})

export const A154_Paymaster_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
