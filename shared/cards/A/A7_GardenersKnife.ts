import { MinorImprovement } from '../types'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A7_GardenersKnife'

export const A7_GardenersKnife = new MinorImprovement({
  id: CARD_ID,
  name: "Gardener's Knife",
  deck: 'A',
  number: 7,
  category: 'FOOD_PROVIDER',
  desc: ['You immediately get 1 <FOOD> for each grain field you have and 1 <GRAIN> for each vegetable field you have.'],
  cost: { wood: 1 },
  passing: true,
  newSet: true,
})

export const A7_GardenersKnife_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const grainFields = player.fields.filter((f) => fieldHasCrop(f, 'grain')).length
    const vegFields = player.fields.filter((f) => fieldHasCrop(f, 'vegetable')).length
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
