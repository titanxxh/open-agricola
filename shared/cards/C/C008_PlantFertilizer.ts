import { defineMinorCard } from '../card-source'
import { wrapOptional } from '../../actions/flow'
import type { ActionFlow } from '../../contract/types'
import { getLogicalFields } from '../helpers/card-field'
import type { PlantAdditionalGoodLocation } from '../../actions/effects/special-effect'
import type { CardImpl } from '../registry'

const CARD_ID = 'C008_PlantFertilizer'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player): ActionFlow | undefined => {
      const locations: PlantAdditionalGoodLocation[] = []

      for (const field of getLogicalFields(player)) {
        if (field.stacks.reduce((sum, stack) => sum + stack.remaining, 0) !== 1) continue
        if (field.kind === 'farmyard') locations.push({ kind: 'field', row: field.row, col: field.col })
        else locations.push({ kind: 'card-field', cardId: field.sourceCard! })
      }

      if (locations.length === 0) return undefined

      return wrapOptional({
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'plant-additional-good', locations },
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C008_PlantFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Plant Fertilizer",
    deck: "C",
    number: 8,
    category: "CROP_PROVIDER",
    desc: ["In each <FIELD> with exactly 1 good, you can immediately place 1 additional good of the same type."],
    cost: {},
    passing: true,
  },
  impl: cardImpl,
})

export const C008_PlantFertilizer_impl = C008_PlantFertilizer.impl
