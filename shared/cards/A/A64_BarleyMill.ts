import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldTotalRemaining } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A64_BarleyMill } from '../../cards-display/A/A64_BarleyMill'
export { A64_BarleyMill }

const CARD_ID = A64_BarleyMill.id

export const A64_BarleyMill_impl = {
  effect: {
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    const grainFields = _state.harvestReapSummary?.[player.id]?.grainFields
      ?? player.fields.filter(
        (field) => fieldHasCrop(field, 'grain') && fieldTotalRemaining(field) > 0,
      ).length
    if (grainFields <= 0) return
    return {
      type: 'seq',
      children: [gainLeaf(CARD_ID, { food: grainFields })],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
