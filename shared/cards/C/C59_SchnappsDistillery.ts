import { fieldHasCrop, fieldFindStackOfKind } from '../../domain/field'
import type { CardImpl } from '../registry'
import { C59_SchnappsDistillery } from '../../cards-display/C/C59_SchnappsDistillery'

const CARD_ID = C59_SchnappsDistillery.id

export const C59_SchnappsDistillery_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const veg = player.resources.vegetable + player.fields
      .filter((f) => fieldHasCrop(f, 'vegetable'))
      .reduce((sum, f) => sum + (fieldFindStackOfKind(f, 'vegetable')?.remaining ?? 0), 0)
    if (veg >= 6) return 2
    if (veg >= 5) return 1
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
