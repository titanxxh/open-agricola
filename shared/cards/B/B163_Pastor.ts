import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B163_Pastor'

/**
 * B163 Pastor — One-time trigger: after any player constructs a room,
 * if the card owner is the only player with exactly 2 rooms, the owner
 * gets 3 wood + 2 clay + 1 reed + 1 stone.
 *
 * Scope: 'any' — we check all construction events (owner or opponents).
 * Uses flag-card to ensure one-time effect.
 */
const listener: CardListenerRegistration = {
  id: 'B163-pastor-after-construct',
  cardIds: [CARD_ID],
  actions: ['construct'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ownerPlayer = context.ownerPlayer
    if (!ownerPlayer) return
    if (!ownerPlayer.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(ownerPlayer, CARD_ID)) return

    // Check: owner must have exactly 2 rooms
    if (ownerPlayer.rooms !== 2) return

    // Check: owner must be the ONLY player with exactly 2 rooms
    const othersWith2Rooms = (context.state.players ?? []).filter(
      (p) => p.id !== ownerPlayer.id && p.rooms === 2,
    )
    if (othersWith2Rooms.length > 0) return

    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { wood: 3, clay: 2, reed: 1, stone: 1 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B163_Pastor = new Occupation({
  id: CARD_ID,
  name: 'Pastor',
  deck: 'B',
  number: 163,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Once you are the only player to live in a house with only 2 rooms, you immediately get 3 <WOOD>, 2 <CLAY>, 1 <REED>, and 1 <STONE> (only once).',
  ],
  cost: {},
  players: '4+',
})
