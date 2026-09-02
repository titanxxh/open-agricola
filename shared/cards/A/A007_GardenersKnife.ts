import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

const CARD_ID = 'A007_GardenersKnife'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const fields = getLogicalFields(player)
    const grainFields = fields.filter((field) => field.stacks.some((stack) => stack.kind === 'grain')).length
    const vegFields = fields.filter((field) => field.stacks.some((stack) => stack.kind === 'vegetable')).length
    if (grainFields === 0 && vegFields === 0) return
    const params: Record<string, number> = {}
    if (grainFields > 0) params.food = grainFields
    if (vegFields > 0) params.grain = vegFields
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A007_GardenersKnife = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Gardener's Knife",
    deck: 'A',
    number: 7,
    category: 'FOOD_PROVIDER',
    desc: ['You immediately get 1 <FOOD> for each <GRAIN> <FIELD> you have and 1 <GRAIN> for each <VEGETABLE> <FIELD> you have.'],
    cost: { wood: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const A007_GardenersKnife_impl = A007_GardenersKnife.impl
