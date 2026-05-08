import { fieldFindStackOfKind, fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D31_Storeroom } from '../../cards-display/D/D31_Storeroom'

const CARD_ID = D31_Storeroom.id

export const D31_Storeroom_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const inFields = (crop: 'grain' | 'vegetable') =>
      player.fields
        .filter((f) => fieldHasCrop(f, crop))
        .reduce((sum, f) => sum + (fieldFindStackOfKind(f, crop)?.remaining ?? 0), 0)
    const grain = player.resources.grain + inFields('grain')
    const veg = player.resources.vegetable + inFields('vegetable')
    const pairs = Math.min(grain, veg)
    return Math.ceil(pairs / 2)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
