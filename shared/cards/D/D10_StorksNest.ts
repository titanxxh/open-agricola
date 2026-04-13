import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D10_StorksNest'

registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (player.rooms <= player.familySize) return
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
})

export const D10_StorksNest = new MinorImprovement({
  id: "D10_StorksNest",
  name: "Stork's Nest",
  deck: "D",
  number: 10,
  category: "FARM_PLANNER",
  desc: ["In the returning home phase of each round, if you have more rooms than people, you can pay 1 <FOOD> to take a __Family Growth__ action."],
  cost: {"reed":1},
  prerequisite: "5 Occupations",
  occupationPrerequisites: {"min":5},
})
