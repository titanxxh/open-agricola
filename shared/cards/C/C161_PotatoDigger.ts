import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { C161_PotatoDigger } from '../../cards-display/C/C161_PotatoDigger'

const CARD_ID = C161_PotatoDigger.id

export const C161_PotatoDigger_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const emptyFields = player.fields.filter((f) => fieldIsEmpty(f)).length
    let n = 0
    if (emptyFields >= 2) n = 1
    if (emptyFields >= 4) n = 2
    if (emptyFields >= 5) n = 3
    if (n === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { vegetable: n },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
