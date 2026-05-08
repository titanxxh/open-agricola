import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D61_BaleofStraw } from '../../cards-display/D/D61_BaleofStraw'
export { D61_BaleofStraw }

const CARD_ID = D61_BaleofStraw.id

export const D61_BaleofStraw_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, player) => {

    // Count grain fields (fields with grain crop planted)
    const grainFieldCount = player.fields.filter(
      (f) => fieldHasCrop(f, 'grain'),
    ).length
    if (grainFieldCount < 3) return

    return gainLeaf(CARD_ID, { food: 2 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
