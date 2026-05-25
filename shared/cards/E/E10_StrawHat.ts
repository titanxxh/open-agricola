import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'

const CARD_ID = 'E10_StrawHat'

const TRIGGER_ROUNDS = [3, 6]

const FARMLAND_SPACE_ID = 'farmland'

export const E10_StrawHat_impl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!TRIGGER_ROUNDS.includes(state.round)) return
    const farmland = state.actionSpaces.find((s) => s.id === FARMLAND_SPACE_ID)
    const hasFarmlandWorker = farmland ? spaceHasPlayer(farmland, player.id) : false
    const hasMoveTarget = hasFarmlandWorker && computeAllowedPlacementSpaces(state, player)
      .some((placement) => placement.spaceId !== FARMLAND_SPACE_ID)
    const children: ActionFlow[] = [gainLeaf(CARD_ID, { food: 1 })]
    if (hasMoveTarget) {
      children.push({
        type: 'leaf',
        actionId: 'move-farmer-to-space',
        params: { excludeSpaceId: FARMLAND_SPACE_ID },
        sourceCard: CARD_ID,
      })
    }
    return { type: 'xor', children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
