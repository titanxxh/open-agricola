import { getRoundPlacementDetails } from '../helpers/round-placement'
import { workersAvailable } from '../../domain/player'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { ActionDefinition } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C22_BasketChair } from '../../cards-display/C/C22_BasketChair'

const CARD_ID = C22_BasketChair.id
const CLEANUP_JOB_CONTRACT_FAKE_ACTION_ID = 'card_C22_BasketChair_cleanupJobContractFake'
const JOB_CONTRACT_ID = 'C23_JobContract'
const LESSONS_SPACE_IDS = ['lessons', 'lessons-4'] as const

const cleanupJobContractFakeAction: ActionDefinition = {
  id: CLEANUP_JOB_CONTRACT_FAKE_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    if (!player.minorPlayed.includes(JOB_CONTRACT_ID)) return { type: 'ok' }
    const realLessonsPlacements = new Set(
      getRoundPlacementDetails(player)
        .filter((placement) => LESSONS_SPACE_IDS.includes(placement.spaceId as typeof LESSONS_SPACE_IDS[number]))
        .map((placement) => `${placement.spaceId}:${placement.workerId}`),
    )
    for (const space of state.actionSpaces) {
      if (!LESSONS_SPACE_IDS.includes(space.id as typeof LESSONS_SPACE_IDS[number])) continue
      space.takenBy = space.takenBy.filter((ref) =>
        ref.playerId !== player.id || realLessonsPlacements.has(`${space.id}:${ref.workerId}`),
      )
    }
    return { type: 'ok' }
  },
}

registerAdHocAction(cleanupJobContractFakeAction)

export const C22_BasketChair_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const first = getRoundPlacementDetails(player)[0]
    if (!first) return
    if (first.spaceId.startsWith('meeting-place')) return
    const origin = state.actionSpaces.find((s) => s.id === first.spaceId)
    if (!origin) return
    if (!origin.takenBy.some(
      (t) => t.playerId === player.id && t.workerId === first.workerId,
    )) return
    // targetCardHold keeps the recalled worker off "home", so the place-farmer
    // step needs a separate at-home farmer. Guard up-front, matching BGA's
    // isDoable propagation.
    if (workersAvailable(state, player) < 1) return

    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'recall-placed-worker',
          params: { workerId: first.workerId, targetCardHold: CARD_ID },
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf',
          actionId: CLEANUP_JOB_CONTRACT_FAKE_ACTION_ID,
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
