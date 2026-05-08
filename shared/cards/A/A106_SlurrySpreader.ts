import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A106_SlurrySpreader } from '../../cards-display/A/A106_SlurrySpreader'

const CARD_ID = A106_SlurrySpreader.id

export const A106_SlurrySpreader_impl = {
  effect: {
  id: CARD_ID,
  onAfterReap: (state, player) => {

    const summary = state.harvestReapSummary?.[player.id]
    if (!summary) return

    const remainingGrainFields = player.fields.filter((field) => fieldHasCrop(field, 'grain')).length
    const remainingVegetableFields = player.fields.filter((field) => fieldHasCrop(field, 'vegetable')).length

    const depletedGrainFields = Math.max(0, (summary.grainFields ?? 0) - remainingGrainFields)
    const depletedVegetableFields = Math.max(0, (summary.vegetableFields ?? 0) - remainingVegetableFields)
    const food = depletedGrainFields * 2 + depletedVegetableFields

    if (food <= 0) return
    return gainLeaf(CARD_ID, { food })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
