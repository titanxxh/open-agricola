import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, GameState, PlayerState, ActionSpace } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import { spaceOccupantCount } from '../../domain/space'
import type { CardImpl } from '../registry'
import { C129_SecondSpouse } from '../../cards-display/C/C129_SecondSpouse'
export { C129_SecondSpouse }

const CARD_ID = C129_SecondSpouse.id

/**
 * C129 Second Spouse — Occupation
 *
 * You can use the Urgent Wish for Children action space even if it is
 * occupied by the first person another player placed.
 *
 * BGA: onPlayerComputeArgsPlaceFarmer → checkCondition:
 * - space occupant count ≤ 2
 * - at least one occupant is another player's FIRST placed farmer this round
 * Players: 3+ (deck configuration, no runtime check).
 */

function checkCondition(
  state: GameState,
  self: PlayerState,
  space: ActionSpace,
): boolean {
  const count = spaceOccupantCount(space)
  if (count < 1 || count > 2) return false
  for (const ref of space.takenBy) {
    if (ref.playerId === self.id) continue
    const other = state.players.find(p => p.id === ref.playerId)
    if (!other) continue
    const firstPlacement = getRoundPlacementDetails(other)[0]
    if (firstPlacement && firstPlacement.workerId === ref.workerId) return true
  }
  return false
}

const computeArgsListener: CardListenerRegistration = {
  id: 'C129-second-spouse-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const space = context.state.actionSpaces.find((s) => s.id === 'urgent-wish-children')
    if (!space) return
    if (!checkCondition(context.state, context.player, space)) return
    if (!space.canBeExecutedByPlayer(context.state, context.player)) return
    const extraOptions: ActionChoiceOption[] = [
      {
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}urgent-wish-children`,
        labelKey: space.nameKey,
        sourceCard: CARD_ID,
      },
    ]
    return { extraOptions, sourceCard: CARD_ID }
  },
}

export const C129_SecondSpouse_impl = {
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
