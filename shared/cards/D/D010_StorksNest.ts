import { defineMinorCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'D010_StorksNest'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    if (player.rooms <= familySize(player)) return
    if (player.resources.food < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        {
          type: 'leaf',
          actionId: 'wish-children',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D010_StorksNest = defineMinorCard({
  meta: {
    id: "D010_StorksNest",
    name: "Stork's Nest",
    deck: "D",
    number: 10,
    category: "FARM_PLANNER",
    desc: ["In the returning home phase of each round, if you have more rooms than people, you can pay 1 <FOOD> to take a __Family Growth__ action."],
    cost: {"reed":1},
    prerequisite: "5 Occupations",
    occupationPrerequisites: {"min":5},
  },
  impl: cardImpl,
})

export const D010_StorksNest_impl = D010_StorksNest.impl
