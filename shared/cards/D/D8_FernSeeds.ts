import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty, fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D8_FernSeeds'

const cardImpl = {
  prerequisiteCheck: (player) => {
    const empty = player.fields.filter(fieldIsEmpty).length
    const planted = player.fields.filter(
      (f) => fieldHasCrop(f, 'grain') || fieldHasCrop(f, 'vegetable'),
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

export const D8_FernSeeds = defineMinorCard({
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

export const D8_FernSeeds_impl = D8_FernSeeds.impl
