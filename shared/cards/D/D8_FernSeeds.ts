import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D8_FernSeeds'

export const D8_FernSeeds = new MinorImprovement({
  id: CARD_ID,
  name: "Fern Seeds",
  deck: "D",
  number: 8,
  category: "CROP_PROVIDER",
  desc: ["You get 2 <FOOD> and 1 <GRAIN>, which you must sow immediately."],
  passing: true,
  prerequisite: "1 Empty and 2 Planted Fields",
})

export const D8_FernSeeds_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => {
    return {
      type: 'seq',
      children: [
        gainLeaf(CARD_ID, { food: 2, grain: 1 }),
        {
          type: 'leaf',
          actionId: 'sow',
          sourceCard: CARD_ID,
          actionContext: { maxSelections: 1, cropType: 'grain' },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
