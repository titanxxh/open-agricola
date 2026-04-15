import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack, isCardFlagged, setCardFlag, writeCardInfobox } from '../helpers/card-state'

const CARD_ID = 'E22_GuestRoom'

const updateInfobox = (player: { cardStates?: Record<string, any> }) => {
  const stack = getCardStack(player as any, CARD_ID)
  writeCardInfobox(player as any, CARD_ID, `${stack.length} Food`)
}

/**
 * E22 Guest Room: Immediately place any amount of food from your supply on this card.
 * Once per round, you can discard 1 food from this card to place a person
 * from your supply in that round (grow-family-without-room).
 *
 * Implementation:
 * - onBuy: store all player food on the card stack as 'food' items, set food to 0.
 * - anytime (once per round): if card stack has food and not flagged,
 *   return flow: pop-card-stack (gives food to player) → pay-resources (discards it)
 *   → flag-card → grow-family-without-room → set-card-infobox
 * - onBeforeStartOfTurn: reset flag for once-per-round.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const foodToStore = player.resources.food
    if (foodToStore > 0) {
      const items = Array.from({ length: foodToStore }, () => 'food')
      pushToCardStack(player, CARD_ID, items)
      player.resources.food = 0
    }
    updateInfobox(player)
  },
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'E22-guest-room-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length <= 0) return

    // Compute what infobox will say after 1 food is removed
    const newCount = stack.length - 1

    return {
      flow: {
        type: 'seq',
        children: [
          // Pop 'food' from card stack → gives +1 food to player
          { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
          // Pay the food back → net 0 for player, card loses 1 food
          { type: 'leaf', actionId: 'pay-resources', params: { food: 1 }, sourceCard: CARD_ID },
          // Flag card (once per round)
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          // Grow family without room
          { type: 'leaf', actionId: 'grow-family-without-room', sourceCard: CARD_ID },
          // Update infobox
          { type: 'leaf', actionId: 'set-card-infobox', sourceCard: CARD_ID, params: { text: `${newCount} Food` } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E22_GuestRoom.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const E22_GuestRoom = new MinorImprovement({
  id: CARD_ID,
  name: 'Guest Room',
  deck: 'E',
  number: 22,
  desc: ['Immediately place any amount of <FOOD> from your supply on this card. Once per round, you can discard 1 <FOOD> from this card to place a person from your supply in that round.'],
  cost: { wood: 4, reed: 1 },
})
