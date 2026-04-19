import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, GameState, PlayerState, ActionSpace } from '../../game/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/placement-constants'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import { spaceOccupantCount } from '../../game/space'

const CARD_ID = 'C129_SecondSpouse'

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
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const space = context.state.actionSpaces.find((s) => s.id === 'urgent-wish-children')
    if (!space) return
    if (!checkCondition(context.state, context.player, space)) return
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

registerCardListener(computeArgsListener)

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
