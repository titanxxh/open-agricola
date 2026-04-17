import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { GameState, PlayerState } from '../../game/types'

const CARD_ID = 'D161_CabbageBuyer'

/**
 * D161 Cabbage Buyer — Each time any player (including you) renovates and then
 * builds no/1 minor/1 major improvement, you can buy 1 vegetable for 3/2/1 food.
 *
 * Simplification: The BGA version uses Engine::insertAtRoot with a tracker to
 * defer the offer until after a potential improvement is built (determining the
 * food cost). This engine feature isn't available here, so we simplify:
 * - After any player renovates, offer 1 vegetable for 2 food.
 *   (This is the middle ground: the improvement discount is common since
 *    renovation often comes with an improvement on the same action space.)
 *
 * The full BGA behavior tracks whether 0, 1 minor, or 1 major improvement is
 * built after the renovation, adjusting cost to 3/2/1 food respectively.
 */

const findOwner = (state: GameState): PlayerState | undefined =>
  state.players?.find((p) => p.occupationPlayed.includes(CARD_ID))

const listener: CardListenerRegistration = {
  id: 'D161-cabbage-buyer-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = findOwner(context.state)
    if (!owner) return

    // Check if owner can afford the food cost
    if ((owner.resources.food ?? 0) < 2) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          gainLeaf(CARD_ID, { vegetable: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const D161_CabbageBuyer = new Occupation({
  id: CARD_ID,
  name: "Cabbage Buyer",
  deck: "D",
  number: 161,
  category: "CROP_PROVIDER",
  desc: [
    'Each time any player (including you) renovates and then builds no/1 minor/1 major improvement, you can buy 1 <VEGETABLE> for 3/2/1 <FOOD>.',
  ],
  cost: {},
  players: "4+",
  newSet: true,
})
