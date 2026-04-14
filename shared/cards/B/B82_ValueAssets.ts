import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'B82_ValueAssets'

registerCardEffect({
  id: CARD_ID,
  onAfterHarvest: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { food: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 1 }, resourcesGained: { wood: 1 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { food: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { clay: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 1 }, resourcesGained: { clay: 1 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { food: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { reed: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 2 }, resourcesGained: { reed: 1 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { food: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { stone: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 2 }, resourcesGained: { stone: 1 } },
      },
    ]

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
})

export const B82_ValueAssets = new MinorImprovement({
  id: CARD_ID,
  name: "Value Assets",
  deck: "B",
  number: 82,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["After each harvest, you can buy exactly one of the following goods: 1 <FOOD> <ARROW> 1 <WOOD>; 1 <FOOD> <ARROW> 1 <CLAY>; 2 <FOOD> <ARROW> 1 <REED>; 2 <FOOD> <ARROW> 1 <STONE>"],
  cost: {},
})
