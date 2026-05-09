import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { C33_GreeningPlan } from '../../cards-display/C/C33_GreeningPlan'

const CARD_ID = C33_GreeningPlan.id

export const C33_GreeningPlan_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const emptyFields = player.fields.filter((f) => fieldIsEmpty(f)).length
    if (emptyFields >= 6) return 5
    if (emptyFields >= 5) return 3
    if (emptyFields >= 4) return 2
    if (emptyFields >= 2) return 1
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
