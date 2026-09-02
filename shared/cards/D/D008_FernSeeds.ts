import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getLogicalFields } from '../helpers/card-field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D008_FernSeeds'

const cardImpl = {
  prerequisiteCheck: (player) => {
    const fields = getLogicalFields(player)
    const empty = fields.filter((field) => field.stacks.length === 0).length
    const planted = fields.filter((field) =>
      field.stacks.some((stack) => stack.kind === 'grain' || stack.kind === 'vegetable'),
    ).length
    return empty >= 1 && planted >= 2
  },
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

export const D008_FernSeeds = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fern Seeds",
    deck: "D",
    number: 8,
    category: "CROP_PROVIDER",
    desc: ["You get 2 <FOOD> and 1 <GRAIN>, which you must sow immediately."],
    passing: true,
    prerequisite: "1 Empty and 2 Planted Fields",
  },
  impl: cardImpl,
})

export const D008_FernSeeds_impl = D008_FernSeeds.impl
