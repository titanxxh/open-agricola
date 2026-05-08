import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D79_CarrotMuseum } from '../../cards-display/D/D79_CarrotMuseum'
export { D79_CarrotMuseum }

const CARD_ID = D79_CarrotMuseum.id

export const D79_CarrotMuseum_impl = {
  effect: {
  id: CARD_ID,
  onAfterRoundEnd: (state, player) => {
    if (![8, 10, 12].includes(state.round)) return

    const vegFields = player.fields.filter(
      (f) => fieldHasCrop(f, 'vegetable'),
    ).length
    const veg = player.resources.vegetable ?? 0

    if (vegFields === 0 && veg === 0) return

    const gainParams: Record<string, number> = {}
    if (vegFields > 0) gainParams.stone = vegFields
    if (veg > 0) gainParams.wood = veg

    return {
      type: 'leaf',
      actionId: 'gain',
      params: gainParams,
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
