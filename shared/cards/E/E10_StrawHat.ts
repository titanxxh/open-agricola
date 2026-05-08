import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import { isSpaceOccupied, spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'E10_StrawHat'
const TRIGGER_ROUNDS = [3, 6]
const FARMLAND_SPACE_ID = 'farmland'

export const E10_StrawHat = new MinorImprovement({
  id: "E10_StrawHat",
  name: "Straw Hat",
  deck: "E",
  number: 10,
  desc: ["At the end of the work phases of rounds 3 and 6, you can move your person from the __Farmland__ action space to an unoccupied action space and take that action, or get 1 <FOOD>."],
  cost: {"reed":1},
})

export const E10_StrawHat_impl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!TRIGGER_ROUNDS.includes(state.round)) return
    // Check if player has a worker on Farmland
    const farmland = state.actionSpaces.find((s) => s.id === FARMLAND_SPACE_ID)
    if (!farmland || !spaceHasPlayer(farmland, player.id)) return
    // Check if unoccupied spaces are available (excluding Farmland)
    const hasAvailable = state.actionSpaces.some(
      (s) => !isSpaceOccupied(s) && s.id !== FARMLAND_SPACE_ID && s.canBeExecutedByPlayer(state, player),
    )
    const children: ActionFlow[] = []
    if (hasAvailable) {
      children.push({
        type: 'leaf',
        actionId: 'move-farmer-to-space',
        params: { excludeSpaceId: FARMLAND_SPACE_ID },
        sourceCard: CARD_ID,
      })
    }
    children.push(gainLeaf(CARD_ID, { food: 1 }))
    return { type: 'xor', optional: true, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
