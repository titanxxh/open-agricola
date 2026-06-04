import { defineMinorCard } from '../card-source'
import { fieldFindStackOfKind, fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D31_Storeroom'

const cardImpl = {
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

export const D31_Storeroom = defineMinorCard({
  meta: {
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
    extraVp: true,
  },
  impl: cardImpl,
})

export const D31_Storeroom_impl = D31_Storeroom.impl
