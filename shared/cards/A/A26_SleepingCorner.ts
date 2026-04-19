import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/placement-constants'
import { isSpaceOccupied, spaceHasPlayer } from '../../game/space'

const CARD_ID = 'A26_SleepingCorner'

/**
 * A26 Sleeping Corner — You can use any __Wish for Children__ action space
 * even if it is occupied by one other player's person.
 *
 * BGA: onPlayerComputeArgsPlaceFarmer adds WishChildren spaces that have
 * exactly 1 farmer on them (not a child).
 *
 * Prerequisite: 2 Grain Fields.
 */
const computeArgsListener: CardListenerRegistration = {
  id: 'A26-sleeping-corner-compute-args',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const wishChildrenSpaces = context.state.actionSpaces.filter(
      (s) => s.id === 'wish-children' || s.id === 'urgent-wish-children',
    )
    const extraOptions: ActionChoiceOption[] = wishChildrenSpaces
      .filter((s) => isSpaceOccupied(s) && !spaceHasPlayer(s, context.player.id))
      .map((s) => ({
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${s.id}`,
        labelKey: s.nameKey,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

registerCardListener(computeArgsListener)

export const A26_SleepingCorner = new MinorImprovement({
  id: CARD_ID,
  name: 'Sleeping Corner',
  deck: 'A',
  number: 26,
  category: 'ACTIONS_BOOSTER',
  desc: ["You can use any __Wish for Children__ action space even if it is occupied by one other player's person."],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '2 Grain Fields',
})
