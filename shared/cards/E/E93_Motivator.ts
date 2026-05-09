import { getRoundPlacementOrder } from '../helpers/round-placement'
import { hasNoUnusedFarmyardSpaces } from '../../domain/farm'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { E93_Motivator } from '../../cards-display/E/E93_Motivator'

const CARD_ID = E93_Motivator.id

export const E93_Motivator_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    if (getRoundPlacementOrder(player).length !== 0) return
    if (!hasNoUnusedFarmyardSpaces(player)) return
    if (workersAvailable(state, player) <= 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
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
