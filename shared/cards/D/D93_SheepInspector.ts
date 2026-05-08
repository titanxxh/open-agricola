import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { D93_SheepInspector } from '../../cards-display/D/D93_SheepInspector'
export { D93_SheepInspector }

const CARD_ID = D93_SheepInspector.id

const MEETING_PLACE_PREFIX = 'meeting-place'

/**
 * D93 Sheep Inspector (Occupation, D, 93):
 * - Once per work phase, after you place a person, you may pay 1 sheep + 2 food
 *   to return one of your OTHER placed persons home. The person on the space
 *   you just placed cannot be recalled, and persons on Meeting Place action
 *   spaces cannot be recalled either.
 *
 * BGA (D93_SheepInspector.php):
 * - isListeningTo: (PlaceFarmer + unflagged) OR (player startOfWork)
 * - onPlayerStartOfWork: unflag
 * - onPlayerAfterPlaceFarmer: build optional SEQ [flagCard, pay(1 sheep+2 food),
 *   actReturnFarmer(excludedFarmer = just-placed-farmer-id)]. The `returnFarmer`
 *   args enumerate the player's currently occupied action spaces, excluding
 *   Meeting Place and the excluded farmer's space.
 *
 * Implementation:
 * - registerCardListener on `place-farmer` phase `after` scope `player`.
 * - If already flagged, skip.
 * - If no candidate space remains (none placed except the current one, or only
 *   Meeting Place), skip.
 * - Return an optional SEQ containing:
 *     flag-card           ← set "used this work phase" flag (inside seq so
 *                           declining the optional branch leaves it unflagged)
 *     pay-resources       ← 1 sheep + 2 food
 *     recall-placed-worker ← dynamic choice over owner's placed spaces
 *                            (excludes just-placed + Meeting Place)
 * - Unflag via onRoundStart card effect (work phase begins at round start).
 */

const isMeetingPlace = (spaceId: string) => spaceId.startsWith(MEETING_PLACE_PREFIX)

const countCandidateSpaces = (
  context: CardListenerContext,
  excludeSpaceId: string | undefined,
): number => {
  return context.state.actionSpaces.filter((space) => {
    if (!spaceHasPlayer(space, context.player.id)) return false
    if (excludeSpaceId && space.id === excludeSpaceId) return false
    if (isMeetingPlace(space.id)) return false
    return true
  }).length
}

const listener: CardListenerRegistration = {
  id: 'D93-sheep-inspector-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return

    const justPlacedSpaceId = context.space?.id
    const candidates = countCandidateSpaces(context, justPlacedSpaceId)
    if (candidates === 0) return

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-flag', flag: true },
        },
        {
          type: 'leaf',
          actionId: 'pay',
          sourceCard: CARD_ID,
          params: { sheep: 1, food: 2 },
        },
        {
          type: 'leaf',
          actionId: 'recall-placed-worker',
          sourceCard: CARD_ID,
          params: {
            excludeSpaceId: justPlacedSpaceId,
            excludeMeetingPlace: true,
          },
        },
      ],
    }
    return {
      flow,
      sourceCard: CARD_ID,
    }
  },
}

export const D93_SheepInspector_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (isCardFlagged(player, CARD_ID)) {
      setCardFlag(player, CARD_ID, false)
    }
    return
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
