import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E014_WoodSaw'
/**
 * E14 Wood Saw — Each time all other players have more people than you,
 * you can take a __Build Rooms__ action without placing a person.
 *
 * BGA: isListeningTo → all other players have more farmers than this player.
 * onPlayerAtAnytime → construct action (optional).
 *
 * Implementation: anytime listener checks if ALL other players have more
 * farmers. If so, offer the construct action.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'E14-wood-saw-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const myFamilySize = familySize(context.player)
    // Check if ALL other players have more farmers than current player
    const otherPlayers = context.state.players.filter(
      (p) => p.id !== context.player.id,
    )
    if (otherPlayers.length === 0) return
    const allOthersHaveMore = otherPlayers.every((p) => familySize(p) > myFamilySize)
    if (!allOthersHaveMore) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'construct',
        optional: true,
        sourceCard: CARD_ID,
        params: { maxRooms: 1 },
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E014_WoodSaw.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E014_WoodSaw = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wood Saw',
    deck: 'E',
    number: 14,
    category: 'FARMYARD_-_HOUSE_BUILDING_OR_RENOVATION',
    desc: ['Each time all other players have more people than you, you can take a __Build Rooms__ action without placing a person.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const E014_WoodSaw_impl = E014_WoodSaw.impl
