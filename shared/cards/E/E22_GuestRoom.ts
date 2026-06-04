import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack, isCardFlagged, setCardFlag, writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import type { PlayerState } from '../../contract/types'

const CARD_ID = 'E22_GuestRoom'
const updateInfobox = (player: PlayerState) => {
  const stack = getCardStack(player, CARD_ID)
  writeCardInfobox(player, CARD_ID, `${stack.length} Food`)
}

const anytimeListener: CardListenerRegistration = {
  id: 'E22-guest-room-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
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
          { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
          // Flag card (once per round)
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          // Grow family without room
          { type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID, actionContext: { skipRoomCheck: true } },
          // Update infobox
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-infobox', text: `${newCount} Food` } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E22_GuestRoom.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
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
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E22_GuestRoom = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Guest Room',
    deck: 'E',
    number: 22,
    desc: ['Immediately place any amount of <FOOD> from your supply on this card. Once per round, you can discard 1 <FOOD> from this card to place a person from your supply in that round.'],
    cost: { wood: 4, reed: 1 },
    category: 'FARMYARD_-_PLACE_FOR_PERSON',
  },
  impl: cardImpl,
})

export const E22_GuestRoom_impl = E22_GuestRoom.impl
