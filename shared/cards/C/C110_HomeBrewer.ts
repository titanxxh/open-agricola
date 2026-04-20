import { Occupation } from '../types'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C110_HomeBrewer'

export const C110_HomeBrewer = new Occupation({
  id: CARD_ID,
  name: "Home Brewer",
  deck: "C",
  number: 110,
  category: "FOOD_PROVIDER",
  desc: ["After the field phase of each harvest, you can use this card to turn exactly 1 <GRAIN> into your choice of 3 <FOOD> or 1 bonus <SCORE>."],
  cost: {},
  players: "1+",
})

export const C110_HomeBrewer_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFieldPhase: (_state, player) => {
    if (player.resources.grain < 1) return

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { grain: 1 }, resourcesGained: { food: 3 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { grain: 1 }, bonusVp: 1 },
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
