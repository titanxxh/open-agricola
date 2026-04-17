import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D31_Storeroom'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const inFields = (crop: 'grain' | 'vegetable') =>
      player.fields.filter((f) => f.crop === crop).reduce((sum, f) => sum + (f.remaining ?? 0), 0)
    const grain = player.resources.grain + inFields('grain')
    const veg = player.resources.vegetable + inFields('vegetable')
    const pairs = Math.min(grain, veg)
    return Math.ceil(pairs / 2)
  },
})

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
