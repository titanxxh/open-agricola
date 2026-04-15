import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E39_Paintbrush'

registerCardEffect({
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (player.resources.clay < 1) return

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { clay: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { clay: 1 }, resourcesGained: { food: 2 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { clay: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { clay: 1 }, bonusVp: 1 },
      },
    ]

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
})

export const E39_Paintbrush = new MinorImprovement({
  id: CARD_ID,
  name: "Paintbrush",
  deck: "E",
  number: 39,
  category: "POINTS_PROVIDER",
  desc: ["Each harvest, you can exchange exactly 1 <CLAY> for your choice of 2 <FOOD> or 1 bonus <SCORE>."],
  cost: { wood: 1 },
  prerequisite: "1 Pig",
})
