import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { fieldHasCrop, fieldFindStackOfKind } from '../../game/field'

const CARD_ID = 'C59_SchnappsDistillery'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const veg = player.resources.vegetable + player.fields
      .filter((f) => fieldHasCrop(f, 'vegetable'))
      .reduce((sum, f) => sum + (fieldFindStackOfKind(f, 'vegetable')?.remaining ?? 0), 0)
    if (veg >= 6) return 2
    if (veg >= 5) return 1
    return 0
  },
})

export const C59_SchnappsDistillery = new MinorImprovement({
  id: CARD_ID,
  name: "Schnapps Distillery",
  deck: "C",
  number: 59,
  category: "POINTS_PROVIDER",
  desc: ["In each feeding phase, you can use this card to turn exactly 1 <VEGETABLE> into 5 <FOOD>. During scoring, you get 1 bonus <SCORE> each for your 5th and 6th <VEGETABLE>."],
  cost: { wood: 2, clay: 1 },
  vp: 2,
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 5 }, max: 1, trigger: 'harvest' },
  ],
})
