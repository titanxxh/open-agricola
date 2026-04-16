import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/place-farmer'

const CARD_ID = 'C129_SecondSpouse'

/**
 * C129 Second Spouse — Occupation
 *
 * You can use the Urgent Wish for Children action space even if it is
 * occupied by another player's person.
 *
 * BGA: onPlayerComputeArgsPlaceFarmer — adds Urgent Wish Children as
 * an extra option when it is occupied by exactly 1 other player's farmer.
 * canUseOccupied allows placement. Conditions: 3+ players in the game,
 * space occupied by exactly 1 farmer from another player.
 *
 * Implementation:
 * - computeArgs on place-farmer: add urgent-wish-children as extra option
 *   when occupied by another player
 * - canUseOccupied on urgent-wish-children: allow when occupied by
 *   another player's farmer
 * Players: 3+.
 */
const computeArgsListener: CardListenerRegistration = {
  id: 'C129-second-spouse-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    // Require 3+ players in the game
    if ((context.state.players?.length ?? 0) < 3) return
    const space = context.state.actionSpaces.find((s) => s.id === 'urgent-wish-children')
    if (!space) return
    // Only when occupied by another player
    if (!space.takenBy || space.takenBy === context.player.id) return
    // Check if the player can actually execute the action
    if (!space.canBeExecutedByPlayer(context.state, context.player)) return
    const extraOptions: ActionChoiceOption[] = [
      {
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}urgent-wish-children`,
        labelKey: space.nameKey,
      },
    ]
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const canUseOccupiedListener: CardListenerRegistration = {
  id: 'C129-second-spouse-can-use-occupied',
  cardIds: [CARD_ID],
  phases: ['canUseOccupied' as ActionHookPhase],
  actions: ['urgent-wish-children'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!context.space?.takenBy) return
    // Must be occupied by another player, not self
    if (context.space.takenBy === context.player.id) return
    // Require 3+ players
    if ((context.state.players?.length ?? 0) < 3) return
    return { canUseOccupied: true }
  },
}

registerCardListener(computeArgsListener)
registerCardListener(canUseOccupiedListener)

export const C129_SecondSpouse = new Occupation({
  id: CARD_ID,
  name: 'Second Spouse',
  deck: 'C',
  number: 129,
  category: 'FAMILY_GROWTH',
  desc: [
    'You can use the __Urgent Wish for Children__ action space (from round 12-13) even if it is occupied by the first person another player placed.',
  ],
  cost: {},
  players: '3+',
})
