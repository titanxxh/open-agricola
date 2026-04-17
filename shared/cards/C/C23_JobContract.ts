import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, GameState, PlayerState } from '../../game/types'
import { addWorkerRef, isSpaceOccupied } from '../../game/space'
import { smallestAvailableWorker } from '../../game/player'

const CARD_ID = 'C23_JobContract'
const LESSONS_SPACE_IDS = ['lessons', 'lessons-4'] as const

/**
 * C23 Job Contract (Minor, C, 23):
 * - If both __Day Laborer__ and the adjacent __Lessons__ action space are
 *   unoccupied, a player may use both spaces with a single person (Day
 *   Laborer first, then Lessons). Afterward both spaces are considered
 *   occupied.
 *
 * BGA (C23_JobContract.php): listens to place-farmer on DayLaborer and,
 * immediately after, inserts a "place fake farmer on Lessons → use lessons"
 * subtree. The fake farmer is removed at end of round.
 *
 * Implementation:
 * - On place-farmer at `day-laborer`, if any lessons space is unoccupied,
 *   return an optional seq whose body is a `play-occupation` leaf for the
 *   lessons action cost, plus a field-effect leaf that marks the lessons
 *   space as taken (so other players cannot use it this round).
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

const listener: CardListenerRegistration = {
  id: 'C23-job-contract-after-day-laborer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'day-laborer') return

    const lessonsSpace = getLessonsSpace(context.state, context.player)
    if (!lessonsSpace) return

    // Check the player has at least one occupation in hand
    // (otherwise the lessons trigger is wasted).
    if (context.player.occupationHand.length === 0) return

    // Mark the lessons space as occupied by this player (fake-farmer).
    const worker = smallestAvailableWorker(context.state, context.player)
    addWorkerRef(lessonsSpace, context.player.id, worker?.id ?? '1')

    const lessonsCost =
      lessonsSpace.id === 'lessons-4'
        ? context.player.occupationPlayed.length <= 1
          ? { food: 1 }
          : { food: 2 }
        : context.player.occupationPlayed.length === 0
          ? {}
          : { food: 1 }

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'play-occupation',
          sourceCard: CARD_ID,
          params: { costOverride: lessonsCost },
        },
      ],
    }
    return {
      flow,
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C23_JobContract = new MinorImprovement({
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
})
