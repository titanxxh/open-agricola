import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { C6_StoneClearing } from '../../cards-display/C/C6_StoneClearing'

const CARD_ID = C6_StoneClearing.id

export const C6_StoneClearing_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const emptyFields = player.fields.filter((f) => fieldIsEmpty(f)).length
      if (emptyFields === 0) return
      return {
        type: 'leaf' as const,
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { stone: emptyFields },
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
