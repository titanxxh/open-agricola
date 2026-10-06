import { defineMinorCard } from '../card-source'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import { removeSyntheticLinkedOccupancyRefs } from '../../domain/space'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { ActionDefinition } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C022_BasketChair'
const CLEANUP_JOB_CONTRACT_FAKE_ACTION_ID = 'card_C022_BasketChair_cleanupJobContractFake'

const cleanupJobContractFakeAction: ActionDefinition = {
  id: CLEANUP_JOB_CONTRACT_FAKE_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const linkedWorkerId = (params as { linkedWorkerId?: string } | undefined)?.linkedWorkerId
    if (!linkedWorkerId) return { type: 'ok' }
    for (const space of state.actionSpaces) {
      removeSyntheticLinkedOccupancyRefs(space, player.id, linkedWorkerId)
    }
    return { type: 'ok' }
  },
}

registerAdHocAction(cleanupJobContractFakeAction)

const cardImpl = {
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

    const cleanupFlow = first.spaceId === 'day-laborer'
      ? [{
          type: 'leaf' as const,
          actionId: CLEANUP_JOB_CONTRACT_FAKE_ACTION_ID,
          params: { linkedWorkerId: first.workerId },
          sourceCard: CARD_ID,
        }]
      : []

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
        ...cleanupFlow,
        {
          type: 'leaf',
          actionId: 'place-farmer',
          optional: true,
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C022_BasketChair = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Basket Chair',
    deck: 'C',
    number: 22,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'When you play this card, you can immediately move the first person you placed this work phase to this card (unless it is on __Meeting Place__). If you do, immediately afterward, you can place another person.',
      ],
    rules: [
      'Only an adult person can be moved to this card; a newborn remains on its action space.',
    ],
    cost: { reed: 1 },
    vp: 1,
    evenMoreSet: true,
  },
  presentation: { heldWorker: true },
  impl: cardImpl,
})

export const C022_BasketChair_impl = C022_BasketChair.impl
