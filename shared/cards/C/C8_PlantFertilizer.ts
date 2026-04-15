import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C8_PlantFertilizer'

// BGA: SPECIAL_EFFECT — for each field with exactly 1 good, place 1 additional good of same type.
// Simplified: gain 1 grain per grain field and 1 vegetable per vegetable field that has exactly 1 good.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const eligibleFields = player.fields.filter((f) => f.crop !== null && f.remaining === 1)
    const grainCount = eligibleFields.filter((f) => f.crop === 'grain').length
    const vegCount = eligibleFields.filter((f) => f.crop === 'vegetable').length
    if (grainCount === 0 && vegCount === 0) return
    const params: Record<string, number> = {}
    if (grainCount > 0) params.grain = grainCount
    if (vegCount > 0) params.vegetable = vegCount
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params,
    }
  },
})

export const C8_PlantFertilizer = new MinorImprovement({
  id: CARD_ID,
  name: "Plant Fertilizer",
  deck: "C",
  number: 8,
  category: "CROP_PROVIDER",
  desc: ["In each field with exactly 1 good, you can immediately place 1 additional good of the same type."],
  cost: {},
  passing: true,
  newSet: true,
})
