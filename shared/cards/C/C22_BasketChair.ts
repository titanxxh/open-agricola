import { MinorImprovement } from '../types'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C22_BasketChair'

export const C22_BasketChair = new MinorImprovement({
  id: CARD_ID,
  name: 'Basket Chair',
  deck: 'C',
  number: 22,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you can immediately move the first person you placed this work phase to this card (unless it is on __Meeting Place__). If you do, immediately afterward, you can place another person.',
  ],
  cost: { reed: 1 },
  vp: 1,
  evenMoreSet: true,
})

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
