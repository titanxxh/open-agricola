import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { E117_PipeSmoker } from '../../cards-display/E/E117_PipeSmoker'

const CARD_ID = E117_PipeSmoker.id

export const E117_PipeSmoker_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, player) => {

    const grainFieldCount = player.fields.filter(
      (f) => fieldHasCrop(f, 'grain'),
    ).length
    if (grainFieldCount < 1) return

    return gainLeaf(CARD_ID, { wood: 2 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
