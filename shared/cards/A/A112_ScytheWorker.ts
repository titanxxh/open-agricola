import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A112_ScytheWorker } from '../../cards-display/A/A112_ScytheWorker'
export { A112_ScytheWorker }

const CARD_ID = A112_ScytheWorker.id

export const A112_ScytheWorker_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return gainLeaf(CARD_ID, { grain: 1 })
  },
  onHarvestFieldPhase: (_state, player) => {
    const grainFieldCount = player.fields.filter(
      (field) => fieldHasCrop(field, 'grain'),
    ).length
    if (grainFieldCount <= 0) return
    return gainLeaf(CARD_ID, { grain: grainFieldCount })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
