import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'

const CARD_ID = 'E10_StrawHat'

const TRIGGER_ROUNDS = [3, 6]

const FARMLAND_SPACE_ID = 'farmland'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!TRIGGER_ROUNDS.includes(state.round)) return
    const farmland = state.actionSpaces.find((s) => s.id === FARMLAND_SPACE_ID)
    const hasFarmlandWorker = farmland ? spaceHasPlayer(farmland, player.id) : false
    const hasMoveTarget = hasFarmlandWorker && computeAllowedPlacementSpaces(state, player, { ignoreWorkerAvailability: true })
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

export const E10_StrawHat = defineMinorCard({
  meta: {
    id: "E10_StrawHat",
    name: "Straw Hat",
    deck: "E",
    number: 10,
    desc: ["At the end of the work phases of rounds 3 and 6, you can move your person from the __Farmland__ action space to an unoccupied action space and take that action, or get 1 <FOOD>."],
    cost: {"reed":1},
    category: 'ACTION_-_GUEST',
  },
  impl: cardImpl,
})

export const E10_StrawHat_impl = E10_StrawHat.impl
