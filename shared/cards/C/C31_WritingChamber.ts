import type { CardImpl } from '../registry'
import { C31_WritingChamber } from '../../cards-display/C/C31_WritingChamber'
export { C31_WritingChamber }

const CARD_ID = C31_WritingChamber.id

export const C31_WritingChamber_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, _player, ctx) => {
    const negativeTotal = (ctx.categories ?? []).reduce((sum, cat) => sum + Math.min(0, cat.total), 0)
    return Math.min(7, Math.abs(negativeTotal))
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
