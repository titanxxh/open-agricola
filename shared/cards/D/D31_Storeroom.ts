import { MinorImprovement } from '../types'
import { fieldFindStackOfKind, fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D31_Storeroom'

export const D31_Storeroom = new MinorImprovement({
  id: CARD_ID,
  name: "Storeroom",
  deck: "D",
  number: 31,
  category: "POINTS_PROVIDER",
  desc: [
    'During scoring, you get ½ bonus <SCORE> for each pair of <GRAIN> plus <VEGETABLE> you have (considering all crops in your supply and fields), rounded up.',
  ],
  cost: { wood: 1, stone: 2 },
  vp: 1,
})

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
