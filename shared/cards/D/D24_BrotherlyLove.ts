import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/placement-constants'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { isSpaceOccupied } from '../../game/space'
import { familySize, workersAvailable } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'D24_BrotherlyLove'

/**
 * D24 Brotherly Love — Minor Improvement
 *
 * If you have exactly 4 family members and 3 are already placed, the 4th
 * can go on the same action space as one of your other family members.
 *
 * BGA: onPlayerComputeArgsPlaceFarmer — if familySize == 4 and
 * workersAvailable == 1 (i.e., 3 placed, 1 remaining), add all spaces
 * where the player's own farmers are placed as extra options.
 *
 * canUseOccupied: allow using spaces occupied by the player's own farmers
 * under the same conditions.
 *
 * Implementation:
 * - computeArgs on place-farmer: when familySize == 4 and workersAvailable == 1,
 *   add all spaces with own farmers as extra choices
 * - canUseOccupied: allow those spaces
 */

const isActive = (context: CardListenerContext): boolean => {
  return familySize(context.player) === 4 && workersAvailable(context.state, context.player) === 1
}

const getOwnFarmerSpaceIds = (context: CardListenerContext): string[] => {
  const placements = getRoundPlacementOrder(context.player)
  // Return unique space IDs where the player has placed farmers this round
  return [...new Set(placements)]
}

const computeArgsListener: CardListenerRegistration = {
  id: 'D24-brotherly-love-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isActive(context)) return
    const ownSpaceIds = getOwnFarmerSpaceIds(context)
    if (ownSpaceIds.length === 0) return
    const extraOptions: ActionChoiceOption[] = []
    for (const spaceId of ownSpaceIds) {
      const space = context.state.actionSpaces.find((s) => s.id === spaceId)
      if (!space) continue
      // Only add occupied spaces (they should all be occupied since farmer placed there)
      if (!isSpaceOccupied(space)) continue
      if (!space.canBeExecutedByPlayer(context.state, context.player)) continue
      extraOptions.push({
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${spaceId}`,
        labelKey: space.nameKey,
        sourceCard: CARD_ID,
      })
    }
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

export const D24_BrotherlyLove = new MinorImprovement({
  id: CARD_ID,
  name: 'Brotherly Love',
  deck: 'D',
  number: 24,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'As long as you have exactly 4 people, in the work phase of each round, you can place your third and fourth person immediately after one another, even on the same action space.',
  ],
  cost: {},
})

export const D24_BrotherlyLove_impl = {
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
