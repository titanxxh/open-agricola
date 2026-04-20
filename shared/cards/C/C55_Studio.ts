import { MinorImprovement } from '../types'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C55_Studio'

export const C55_Studio = new MinorImprovement({
  id: CARD_ID,
  name: "Studio",
  deck: "C",
  number: 55,
  category: "FOOD_PROVIDER",
  desc: ["In the feeding phase of each harvest, you can use this card to turn exactly 1 <WOOD>/<CLAY>/<STONE> into 2/2/3 <FOOD>."],
  vp: 1,
  cost: { clay: 1, reed: 1 },
})

export const C55_Studio_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, _player) => {

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
          { type: 'leaf', actionId: 'pay-resources', params: { clay: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { clay: 1 }, resourcesGained: { food: 2 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { stone: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { stone: 1 }, resourcesGained: { food: 3 } },
      },
    ]

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
