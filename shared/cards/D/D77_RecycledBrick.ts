import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { GameState, PlayerState } from '../../game/types'

const CARD_ID = 'D77_RecycledBrick'

/**
 * D77 Recycled Brick (MinorImprovement, D, 77)
 * Each time any player renovates to stone, card owner gets 1 clay
 * per newly renovated room.
 *
 * BGA: onPlayerAfterRenovate — checks if the player renovated to stone,
 * then gives 1 clay per room to the card owner.
 *
 * scope 'any' — fires when any player renovates.
 * Cost: 1 food, prerequisite: 3 occupations.
 */

const findOwner = (state: GameState): PlayerState | undefined =>
  state.players?.find((p) => p.minorPlayed.includes(CARD_ID))

const listener: CardListenerRegistration = {
  id: 'D77-recycled-brick-any-renovate-stone',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = findOwner(context.state)
    if (!owner) return

    // Check if the renovating player just renovated to stone
    const renovatingPlayer = context.triggerPlayer ?? context.player
    if (renovatingPlayer.houseType !== 'stone') return

    // Give 1 clay per room to the card owner
    const rooms = renovatingPlayer.rooms
    if (rooms <= 0) return

    return { flow: gainLeaf(CARD_ID, { clay: rooms }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const D77_RecycledBrick = new MinorImprovement({
  id: CARD_ID,
  name: 'Recycled Brick',
  deck: 'D',
  number: 77,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time any player (including you) renovates to stone, you get 1 <CLAY> for each newly renovated room.'],
  cost: { food: 1 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
