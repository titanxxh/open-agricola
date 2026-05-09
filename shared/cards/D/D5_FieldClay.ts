import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D5_FieldClay } from '../../cards-display/D/D5_FieldClay'

const CARD_ID = D5_FieldClay.id

export const D5_FieldClay_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const plantedCount = player.fields.filter((f) => !fieldIsEmpty(f)).length
    if (plantedCount > 0) {
      return { type: 'seq', children: [gainLeaf(CARD_ID, { clay: plantedCount })] }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
