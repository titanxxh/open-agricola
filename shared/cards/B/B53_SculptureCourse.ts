import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'B53_SculptureCourse'
const harvestRounds = [4, 7, 9, 11, 13, 14]

registerCardEffect({
  id: CARD_ID,
  onAfterRoundEnd: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (harvestRounds.includes(state.round)) return

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { wood: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { wood: 1 }, resourcesGained: { food: 2 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { stone: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 4 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { stone: 1 }, resourcesGained: { food: 4 } },
      },
    ]

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
})

export const B53_SculptureCourse = new MinorImprovement({
  id: CARD_ID,
  name: "Sculpture Course",
  deck: "B",
  number: 53,
  category: "FOOD_PROVIDER",
  desc: ["At the end of each round that does not end with a harvest, you can use this card to exchange your choice of 1 <WOOD> for 2 <FOOD>, or 1 <STONE> for 4 <FOOD>."],
  cost: { grain: 1 },
})
