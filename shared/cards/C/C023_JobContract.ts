import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionDefinition, ActionFlow, GameState, PlayerState } from '../../contract/types'
import { addSyntheticLinkedOccupancyRef, isSpaceOccupied } from '../../domain/space'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import { countTriggerCardsAs } from '../helpers/trigger-snapshot'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'C023_JobContract'
const LESSONS_SPACE_IDS = ['lessons', 'lessons-4'] as const
const OCCUPY_ACTION_ID = 'card_C023_JobContract_occupyLessons'

const occupyLessonsAction: ActionDefinition = {
  id: OCCUPY_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const spaceId = (params as { spaceId?: unknown } | undefined)?.spaceId
    const linkedWorkerId = (params as { linkedWorkerId?: unknown } | undefined)?.linkedWorkerId
    if (
      typeof spaceId !== 'string'
      || !LESSONS_SPACE_IDS.includes(spaceId as typeof LESSONS_SPACE_IDS[number])
      || typeof linkedWorkerId !== 'string'
    ) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    const lessonsSpace = state.actionSpaces.find((space) => space.id === spaceId)
    if (!lessonsSpace || isSpaceOccupied(lessonsSpace)) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }
    addSyntheticLinkedOccupancyRef(lessonsSpace, player.id, linkedWorkerId, CARD_ID)
    return { type: 'ok' }
  },
}

registerAdHocAction(occupyLessonsAction)

/**
 * C23 Job Contract (Minor, C, 23):
 * - If both __Day Laborer__ and the adjacent __Lessons__ action space are
 *   unoccupied, a player may use both spaces with a single person (Day
 *   Laborer first, then Lessons). Afterward both spaces are considered
 *   occupied.
 *
 * Rule: listens to place-farmer on Day Laborer and offers Lessons as an
 * optional follow-up. The linked occupancy is added only after acceptance.
 *
 * Implementation:
 * - On place-farmer at `day-laborer`, if any lessons space is unoccupied,
 *   return an optional seq whose body is an `occupation` leaf for the
 *   lessons action cost, followed by a card-local occupancy action.
 * - The fake-farmer return at end-of-round is implicit: our engine resets
 *   `actionSpace.takenBy` between rounds via the standard cleanup (see
 *   returning-home phase in game-session.ts), so the lessons space becomes
 *   available again next round without additional bookkeeping.
 */

const getLessonsSpace = (state: GameState, player: PlayerState) => {
  const playerCount = (state.players ?? []).length
  // Prefer 'lessons' for <=3 players, 'lessons-4' for 4 players.
  const preferred = playerCount >= 4 ? 'lessons-4' : 'lessons'
  const chosen =
    state.actionSpaces.find((s) => s.id === preferred && !isSpaceOccupied(s)) ??
    state.actionSpaces.find(
      (s) => LESSONS_SPACE_IDS.includes(s.id as typeof LESSONS_SPACE_IDS[number]) && !isSpaceOccupied(s),
    )
  if (!chosen) return null
  void player
  return chosen
}

const linkedWorkerIdForCurrentPlacement = (context: CardListenerContext): string | null => {
  const spaceId = context.space?.id
  if (!spaceId) return null
  const placements = getRoundPlacementDetails(context.player)
  const placement = [...placements].reverse().find((entry) => entry.spaceId === spaceId)
  if (placement) return placement.workerId
  return context.space?.takenBy.find((ref) => ref.playerId === context.player.id)?.workerId ?? null
}

const listener: CardListenerRegistration = {
  id: 'C23-job-contract-after-day-laborer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return

    const lessonsSpace = getLessonsSpace(context.state, context.player)
    if (!lessonsSpace) return

    // The reference C23 does NOT gate on occupationHand: even with empty hand the fake
    // worker still occupies the lessons space (cascading lessons-listeners on
    // other cards e.g. A113 / B155 still fire). The optional occupation
    // leaf is still safe to offer — the player can simply skip the seq.

    const linkedWorkerId = linkedWorkerIdForCurrentPlacement(context)
    if (!linkedWorkerId) return

    const occupationCount = countTriggerCardsAs(context, context.player, 'occupation')
    const lessonsCost =
      lessonsSpace.id === 'lessons-4'
        ? occupationCount <= 1
          ? { food: 1 }
          : { food: 2 }
        : occupationCount === 0
          ? {}
          : { food: 1 }

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'occupation',
          sourceCard: CARD_ID,
          params: { exactCost: lessonsCost },
        },
        {
          type: 'leaf',
          actionId: OCCUPY_ACTION_ID,
          sourceCard: CARD_ID,
          params: { spaceId: lessonsSpace.id, linkedWorkerId },
        },
      ],
    }
    return {
      flow,
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C023_JobContract = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Job Contract',
    deck: 'C',
    number: 23,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'If both are unoccupied, you can use the __Day Laborer__ and the adjacent __Lessons__ action space with a single person (in that order). Afterward, both spaces are considered occupied.',
      ],
    cost: {},
    prerequisite: 'No Occupations',
    occupationPrerequisites: { max: 0 },
  },
  impl: cardImpl,
})

export const C023_JobContract_impl = C023_JobContract.impl
