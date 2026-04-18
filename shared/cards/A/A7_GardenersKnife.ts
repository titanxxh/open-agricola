import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { fieldHasCrop } from '../../game/field'

const CARD_ID = 'A7_GardenersKnife'

registerCardEffect({
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
})

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
