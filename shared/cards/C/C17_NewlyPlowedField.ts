import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C17_NewlyPlowedField'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf',
      actionId: 'plow',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { unrestricted: true, trueAction: false },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C17_NewlyPlowedField = defineMinorCard({
  meta: {
    id: "C17_NewlyPlowedField",
    name: "Newly-Plowed Field",
    deck: "C",
    number: 17,
    category: "FARM_PLANNER",
    desc: ["When you play this card, you can immediately plow 1 field, which needs not be adjacent to another field."],
    cost: {},
    prerequisite: "Exactly 3 Field Tiles",
  },
  impl: cardImpl,
})

export const C17_NewlyPlowedField_impl = C17_NewlyPlowedField.impl
