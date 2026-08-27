import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import { isSyntheticLinkedOccupancy } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'E010_StrawHat'

const TRIGGER_ROUNDS = [3, 6]

const FARMLAND_SPACE_ID = 'farmland'

const workerChoiceFlow = (workerId: string): ActionFlow => ({
  type: 'xor',
  children: [
    gainLeaf(CARD_ID, { food: 1 }),
    {
      type: 'leaf',
      actionId: 'move-farmer-to-space',
      params: { excludeSpaceId: FARMLAND_SPACE_ID, workerId },
      sourceCard: CARD_ID,
      actionContext: {
        moveFarmerSourceSpaceId: FARMLAND_SPACE_ID,
        moveFarmerWorkerId: workerId,
      },
    },
  ],
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!TRIGGER_ROUNDS.includes(state.round)) return
    const farmland = state.actionSpaces.find((s) => s.id === FARMLAND_SPACE_ID)
    const workers = farmland?.takenBy.filter((worker) =>
      worker.playerId === player.id && !isSyntheticLinkedOccupancy(worker)
    ) ?? []
    if (workers.length === 0) return
    return { type: 'seq', children: workers.map((worker) => workerChoiceFlow(worker.workerId)) }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E010_StrawHat = defineMinorCard({
  meta: {
    id: "E010_StrawHat",
    name: "Straw Hat",
    deck: "E",
    number: 10,
    desc: ["At the end of the work phases of rounds 3 and 6, you can move your person from the __Farmland__ action space to an unoccupied action space and take that action, or get 1 <FOOD>."],
    cost: {"reed":1},
    category: 'ACTION_-_GUEST',
  },
  impl: cardImpl,
})

export const E010_StrawHat_impl = E010_StrawHat.impl
