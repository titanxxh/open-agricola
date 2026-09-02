import { defineMinorCard } from '../card-source'
import { getLogicalFields } from '../helpers/card-field'
import type { CardImpl } from '../registry'

const CARD_ID = 'C059_SchnappsDistillery'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const veg = player.resources.vegetable + getLogicalFields(player)
      .flatMap((field) => field.stacks)
      .filter((stack) => stack.kind === 'vegetable')
      .reduce((sum, stack) => sum + stack.remaining, 0)
    if (veg >= 6) return 2
    if (veg >= 5) return 1
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C059_SchnappsDistillery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Schnapps Distillery",
    deck: "C",
    number: 59,
    category: "FOOD_PROVIDER",
    desc: ["In each feeding phase, you can use this card to turn exactly 1 <VEGETABLE> into 5 <FOOD>. During scoring, you get 1 bonus <SCORE> each for your 5th and 6th <VEGETABLE>."],
    cost: { stone: 2, vegetable: 1 },
    vp: 2,
    exchanges: [
        { from: { vegetable: 1 }, to: { food: 5 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
      ],
    extraVp: true,
  },
  impl: cardImpl,
})

export const C059_SchnappsDistillery_impl = C059_SchnappsDistillery.impl
