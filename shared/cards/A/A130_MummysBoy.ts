import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/place-farmer'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { isSpaceOccupied } from '../../domain/space'
import { familySize, workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { A130_MummysBoy } from '../../cards-display/A/A130_MummysBoy'
export { A130_MummysBoy }

const CARD_ID = A130_MummysBoy.id

/**
 * A130 Mummy's Boy:
 * Once per round, when placing a person after your first two, you can place it on the
 * action space with your 2nd person and use that space again (unless Meeting Place).
 *
 * BGA:
 * - StartOfTurn → unflag
 * - After place-farmer: if countPlacedFarmers >= 3 and farmer lands on 2nd farmer's space → flag
 * - computeArgs: if countPlacedFarmers >= 2 and not flagged, add 2nd farmer's space as option
 */

const getSecondFarmerSpaceId = (context: CardListenerContext): string | null => {
  const placements = getRoundPlacementOrder(context.player)
  if (placements.length < 2) return null
  return placements[1] ?? null
}

const MEETING_PLACE_IDS = new Set(['meeting-place', 'meeting-place-solo'])

const computeArgsListener: CardListenerRegistration = {
  id: 'A130-mummys-boy-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    // Need at least 2 farmers already placed (placedFarmers = familySize - workersAvailable)
    const placedFarmers = familySize(context.player) - workersAvailable(context.state, context.player)
    if (placedFarmers < 2) return
    const secondSpaceId = getSecondFarmerSpaceId(context)
    if (!secondSpaceId) return
    if (MEETING_PLACE_IDS.has(secondSpaceId)) return
    // Only add if the space is occupied (otherwise it's already available)
    const space = context.state.actionSpaces.find((s) => s.id === secondSpaceId)
    if (!space || !isSpaceOccupied(space)) return
    const extraOptions: ActionChoiceOption[] = [
      {
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${secondSpaceId}`,
        labelKey: space.nameKey,
        sourceCard: CARD_ID,
      },
    ]
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'A130-mummys-boy-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    const placedFarmers = familySize(context.player) - workersAvailable(context.state, context.player)
    if (placedFarmers < 3) return
    const secondSpaceId = getSecondFarmerSpaceId(context)
    if (!secondSpaceId) return
    if (context.space?.id === secondSpaceId) {
      setCardFlag(context.player, CARD_ID, true)
    }
  },
}

export const A130_MummysBoy_impl = {
  listeners: [computeArgsListener, afterPlaceFarmerListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(player, CARD_ID)) {
      setCardFlag(player, CARD_ID, false)
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
